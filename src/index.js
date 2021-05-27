'use strict';
// const http = require('http')
const querystring = require('querystring')
// so, prank'd myself, but we're not in a module. We should be but we aren't. So gotta go with require syntax.
// the node docs, as it turns out, defaults to showing you the ESM version
// import * as fs from 'fs/promises';   // using promise api over sync api (which is just 'fs')
const fs = require('fs/promises');   // using promise api over sync api (which is just 'fs')

const express = require('express');
const discord = require('discord.js');
const axios = require('axios');
const Redis = require('ioredis'); // https://github.com/luin/ioredis
const date = require('date-and-time');
const { json } = require('express');

const app = express()

const client = new discord.Client()
const token = `${process.env.DISCORD_TOKEN}`

const DB_HOST="redis" // docker bind - Parameterize this
const redis = new Redis(DB_HOST);

// One thing we can use oauth for is verification - logging into the web panel with a valid OAUTH token (with identity scope, likely)
// then only people with the correct permission can login.

// This link lets someone register their bot to a server, and set up a webhook. 
// TODO gracefully handle cases where necessary permissions are not granted.
const CURRENT_LINK = "https://discord.com/api/oauth2/authorize?client_id=846454323856408636&permissions=536939520&redirect_uri=https%3A%2F%2Flinguine.hfarr.net%2Fapi%2Ftoken&response_type=code&scope=bot%20webhook.incoming"

app.get('/', (req, res) => {
    res.send(`<p>Register a bot</p>
<a href=${CURRENT_LINK}>register webhook</a>`)

})

app.get('/success', (req, res) => {
    res.send('Hi! Glad you joined us')
})

app.get('/no', (req, res) => {
    res.redirect('/')
})

const API_ENDPOINT = 'https://discord.com/api/oauth2/token'
const CLIENT_ID = `${process.env.CLIENT_ID}`
const CLIENT_SECRET = `${process.env.CLIENT_SECRET}`
// might have to use. Im not 100% positive what happens when you give a different redirect to the one used for code granting.
const REDIRECT_URI = 'https://linguine.hfarr.net/api/token'

// returns a promise, yay async
function exchange_code(code) {

    const data = {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
    }
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    const options = {
        method: 'POST',
        headers,
        data: querystring.stringify(data),
        url: API_ENDPOINT,
    }

    return axios(options)
}

// Discord OAUTH2 token, queried with handoff token
app.get('/api/token', (req, res) => {
    let { code, state } = req.query
    let { error, error_description } = req.query

    if (error !== undefined) {
        res.send('Failed to add bot! Did you cancel the request?')
        return
    }

    if (code === undefined) {
        res.send("Huh! did you mean to visit this page?")
        return
    }

    console.log('Bot registration')
    exchange_code(code)
        .then(discord_response => { // could call it success response
            console.log(`Status: ${discord_response.status}`)
            console.log("Registration successful? if axios only calls resolve when it gets 200, probably")
            new_registration(discord_response.data) // TODO make async

            res.send("Bot registered succesfully") // redirect?
        })
        .catch(error => {
            console.error("Error :(")
            console.error(error)
            res.send('Error registering bot')
        })

})


function new_registration(info) {

    let { access_token, refresh_token, token_type, guild, webhook } = info

    // how we'll identify the bot
    let guild_id = guild["id"]

    let guild_info = {
        guild_id: guild_id,
        token: access_token,
        refresh_token: refresh_token,
        token_type: token_type,
    }

    // only saving one webhook to a guild for this bot, so we won't make it a list
    let { id, token, channel_id } = webhook
    let hook = { id, token, channel_id }

    // save in db
    redis.pipeline()
        .rpush('joined_guilds', guild_id)                       // All guilds to which this bot has ever been added. Take note, if the bot is removed, it is NOT removed from this list - for now
        .set(`discordInfo:${JSON.stringify(info)}`)             // Original response from discord in case we need to recover state
        .set(`guilds:${guild_id}`, JSON.stringify(guild_info))  // TODO use a redis hash, or zmap or whatever
        .set(`webhooks:${guild_id}`, JSON.stringify(hook))      // yeah. storing JSON strings... not the best?
        .exec((err, results) => {})                             // TODO error handling. lots of work pushed off today..

}

// This only applies to numbers, since the automatic default Im DECLARING to be 0.
// This is a good case for generics. Other types might have default values of their type, so if v and dv are 
// constrained to the same type, then I can apply the default value of the type for dv if it 
// goes unspecified. Moreover we can specify a "constraint" predicate rather than checking if v is not null, is not undefined
// This function returns v unless it is null or undefined, then it returns a default value. Numerics only (for now)
// could probably use Number.isNan, which would cover the null, undefined, and unparseable cases
const valueOrDefault = (v, dv=0) => Number.isFinite(v) ? v : dv
const compose = (f,g) => x => f(g(x))   // Im glad the notation is flexible lol, feels closer to haskell

// Small utility function. 4am is when points expire. To implement this we use redis
// key expiration. After the key expires, if we try to read it, we'll get a default
// of 0 as we interpret no points stored as no points whatsoever.
// I should publish this as a package on the NPM registry haha
function secondsTill4am() {
    // Lots of string manipulation to arrive at what we want, possible room for optimization.
    const UTC_RESET_HOUR = 8
    const now = new Date();
    let [ymd, hour] = date.format(now, 'YYYY-MM-DD HH', true).split(' ')
    let today = date.parse(ymd, 'YYYY-MM-DD', true)
    hour = parseInt(hour)

    let resetTime = date.addHours(today, UTC_RESET_HOUR)
    if (hour > UTC_RESET_HOUR) {
        resetTime = date.addDays(resetTime, 1)
    }
    // if, for some reason, we cross the 4AM threshold before finishing this function, then we don't want to
    // replace 'now' with a newly constructed date, because that would but 'now' after 'resetTime'.
    // Just poor luck for the sap that earned points. Highly unlikely - famous last words
    return date.subtract(resetTime, now).toSeconds()
}

// TODO need to get a graps on Promise fundamentals, and how 'then', 'catch', etc. are implemented. Rough idea atm
// Retrieves guild information from redis-
//  note that I'm constructing basically a jank object. Really should use the class semantics.
//  note this returns a promise
function getGuildInfo(guildID) {
    const guildKey = `guilds:${guildID}`
    const promise = redis.get(guildKey)

    // Function that we'll use to modify returned value from points or linguines.
    // This first converts values in Redis to a number, then enforces default if undefined/null/NaN
    // I think we could accomplish something similar with Lua scripts, transform on certain key passes, but nah.
    const transformValue = compose(valueOrDefault, parseInt)
    return promise
        .then(guildStr => {
            let guildInfo = JSON.parse(guildStr)
            guildInfo.getGuildMember = (userID) => get_user(guildID, userID)
            guildInfo.sendMessage = (message) => send_message(guildID, message)

            // TODO redis error handling. Also TODO this may not be the best way to use an async pattern.
            // could use multiple redis connections and name space the keys... hmm
            guildInfo.getPoints = (userID) => redis.get(`${guildID}:${userID}:points`).then(transformValue);
                // .then((ps) => { let p = transformValue(ps); console.log(`Got points ${p}`); return p });
            guildInfo.getLinguines = (userID) => redis.get(`${guildID}:${userID}:linguines`).then(transformValue);
                // .then((ps) => { let p = transformValue(ps); console.log(`Got linguines ${p}`); return p });
            // yes technically we don't need to set the experiation if the points exist already but that micro optimization is not worth the effort.
            guildInfo.setPoints = (userID, points) => { redis.setex(`${guildID}:${userID}:points`, Math.trunc(secondsTill4am()), points) } 
            guildInfo.setLinguines = (userID, linguines) => { redis.set(`${guildID}:${userID}:linguines`, linguines) }
            
            return guildInfo
        })
        .catch(error => { console.error("Error creating guild object") })    // I generally don't like returning null on failure. It would be better, probably, to make this a promise overall.
        // this handler ONLY catches errors from the initial redis.get(guildKey), ~~the rest is the executor of another promise (ish)~~ or rather, just body decs.
}

/**
 * Get the corresponding GuildMember instance for a user's snowflake, 
 * within the guild, or null if such a user doesn't exist.
 * @param {*} guild_id Snowflake of guild
 * @param {*} user_id Snowflake of user
 * @returns GuildMember object referring to user with id
 */
function get_user(guild_id, user_id) {
    return new Promise((resolve, reject) => {
        client.guilds.fetch(guild_id)
            .then(guild => guild.member(user_id))
            .then(resolve)  // this seems similar to calling .resolve(...) on the final promise
            .catch(reject)
    })
}

/**
 * Sends a message to the webhook of a channel
 * @param {*} guild_id Snowflake of the guild
 * @param {*} message Message to send
 */
function send_message(guild_id, message) {
    redis.get(`webhooks:${guild_id}`)
        .then(val => JSON.parse(val))
        .then(({id}) => client.fetchWebhook(id))    // have id, calling another Promise
        .then(webhook => webhook.send(message))
        .catch(console.error)
}

// Parse an ID from user mention in discord, which wraps it in angle brackets and varying 
// other symbols (I've seen !, &, and plain- not sure exactly what they indicate)
function parse_user_mention(mention_string) {
    const user_match = /\D*(?<id>\d+).*/
    let { groups: { id: result = null } = {} } = user_match.exec(mention_string) ?? {}
    return result
}

function add_points(guild_id, user_id, points) {

    let guildInfo 
    return getGuildInfo(guild_id)
        .then(gi => { guildInfo = gi; return guildInfo.getPoints(user_id) })
        .then(oldPoints => {
            let newPoints = oldPoints + points
            let [ pointsToSet, newLinguines ] = [ (newPoints % 100), Math.trunc(newPoints / 100) ]
            guildInfo.setPoints(user_id, pointsToSet)

            if (newLinguines > 0) {
                add_linguines(guild_id, user_id, newLinguines)
                get_user(guild_id, user_id)
                    .then(usr => guildInfo.sendMessage(`${usr.toString()} has earned ${newLinguines === 1 ? `a Linguine.` : `${newLinguines} Linguines.`}`))
            }
            return pointsToSet
        })
}

function add_linguines(guild_id, user_id, linguines = 1) {
    let guildInfo   // maybe create syntax for "with" scopes, so you can specify variables available in all promises, or bind results available to succeeding pipelined function?
    return Promise.resolve()
        .then(() => getGuildInfo(guild_id))
        .then(gi => { guildInfo = gi; return guildInfo.getLinguines(user_id) })
        .then(oldLinguines => oldLinguines + linguines)
        .then(newLinguines => { guildInfo.setLinguines(user_id, newLinguines); return newLinguines })
}

function points_command(msg, [user, points_str]) {

    let guild_id = msg.guild.id

    // arguments in the deconstruction are either strings or undefined, unless someone pulls a big prank. in a module it wouldnt be an issue :eye_roll: because this code would be hidden
    if (user === undefined) { // no argument to !points, so pretend the requesting user passed themselves as an argument
        user = msg.author.id
    }

    // Ive found that in substr using offset of 0 and 1 back from length yield the same string! seems inconsistent.
    // Slice on hte other hand operates on arrays, and when a string becomes arrays it is given the code point treatment, so we don't have to worry about off by one 
    // code unit errors (I think, at least. Need to experiment and read more of Horstmann)
    // UPDATE: okay lol so big CAUTION text on page 117. If the second arg to substring is bigger, the ARGUMENTS GET SWITCHED (why!)
    //      horstmann prefers slice, and I think I do too. Read the text for his reasoning
    let points_recipient_id = parse_user_mention(user) // Retrieve snowflake of mentioned user
    let points_recipient = msg.guild.member(points_recipient_id)
    let authorAsGuildMember = msg.guild.member(msg.author)

    if (points_recipient !== null) {    // Successfully parsed a user on this guild

        let points = parseInt(points_str)
        if (points > 0) {
            // let new_total = guild_info['user_data'][points_recipient_id]['points']
            add_points(guild_id, points_recipient_id, points)
                // .then(() => getGuildInfo(guild_id))
                // .then(gi => gi.getPoints(points_recipient_id))
                .then(new_total => msg.channel.send(`${authorAsGuildMember.displayName} gave ${points_recipient.displayName} ${points} points! New total: ${new_total}`))
        } else {
            getGuildInfo(guild_id)
                .then(gi => gi.getPoints(points_recipient_id))
                .then(current_points => msg.channel.send(`${points_recipient.displayName} has ${current_points} point${current_points === 1 ? '' : 's'}.`))
        }
    }
}

function linguines_command(msg, [user]) {
    let guild_id = msg.guild.id
    // let guild_info = guilds[guild_id]

    if (user === undefined) { // grab points of message sender if no arg supplied
        user = msg.author.id
    }

    let user_id = parse_user_mention(user)
    let member = msg.guild.member(user_id)

    if (member !== null) {
        getGuildInfo(guild_id)
            .then(gi => gi.getLinguines(user_id))
            .then(current_linguines => msg.channel.send(`${member.displayName} has ${current_linguines} linguines.`))
        // msg.channel.send(`${member.toString()} has ${current_linguines} linguine${current_linguines === 1 ? '' : 's'}.`)
    }
}

const CMD_PREFIX = '!'
const COMMANDS = {
    points: points_command,
    linguines: linguines_command,
}

// Everything after the !
// TODO make this a "registered commands" deal, so we don't have to explicitly know what commands are registered, this just calls the relevant handler
//  if it matches. We register a handle for matching patterns when needed.
function handle_cmd(msg) {
    let [command, ...args] = msg.content.split(" ")

    let func = COMMANDS[command.toLocaleLowerCase().slice(CMD_PREFIX.length)]
    if (func !== undefined) {
        func(msg, args)
    } else {
        console.log("Not a command")
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`)
});
client.on('message', msg => {
    if (msg.content.startsWith(CMD_PREFIX)) {
        console.log(`${msg.author.tag} in #${msg.channel.name} sent: ${msg.content}`)
        handle_cmd(msg)
    }
});

// I have no clue why - but even though "server" is not a name in the global scope (that I know of?)
// if I assign it to the return from app.listen(...) it will not terminate the server. but if I do
// by calling server.close(), it will. :/
// const server = 
// app.listen(port, hostname)
(async function () {
    console.log("Begin")
    try {
        await fs.mkdir('/tmp/apps', { recursive: true })
        try {
            // TODO use 'unlink' instead?
            // Okay so according to https://nodejs.org/api/net.html#net_server_listen all sockets are set to SO_REUSEADDR- which means you can
            //      listen on the same socket again, *provided you close the server*. which we, notoriously, do not do.
            await fs.unlink('/tmp/apps/linguine.socket') // since we're the maintainers of this file, it should be okay, but overall not too great?
        } catch (err) {
            console.log(err.message);
            console.log("Proceeding")
        }
        // like Ideally we are 'free'ing resources after the program exits. I almost want to write a wrapper process that manages these socket files
        // for a process, and when it terminates, delete any files it acquired. Becauase the socket sticks around on termination. And we can't guarantee
        // we're going to go through the signal handler!
        // TODO when volume is mounted we need to ensure it gets the correct ownership w/in the node container
        let appServer = app.listen('/tmp/apps/linguine.socket') // unix sockets are slight cans of worms- from the directory I chose, to permissions. use /var/run?
        appServer.on('close', (error) => {
            console.log("Server SHOULD close")
            if (error !== undefined) {
                console.log(error)
            }
        })

        try {
            // need to do this otherwise the nginx user can't read
            // isolate the management of this file from the this code- really all we should know is that we're
            // binding to this socket. Management of it otherwise needs to happen somewhere else.
            await fs.chmod('/tmp/apps/linguine.socket', 0o777)
        } catch (err) {
            console.error("Could not set permissions for unix socket")
            process.exit(1)
        }

        // discord client login
        client.login(token)

        // process.stdout.write("Ahh")
        console.log("Am I reached?")

        process.on('SIGTERM', () => {

            // Disconnect and delete client
            client.destroy()

            // Disconnect redis (using quit() over disconnect() is the graceful approach)
            redis.quit(false)

            // Close the server
            appServer.close(() => { 
                console.log("Process terminated") 
                appServer.getConnections((err, count) => {
                    if (err !== undefined) {
                        console.error(err)
                    }
                    console.log(`Outstanding connections ${count}`)
                    if (count > 0) {
                        console.log(' ^^ Should probably close them!')
                    }
                })
            })

        });
    } catch (err) {
        console.error("Error running program:")
        console.error(error)
    }
})();
