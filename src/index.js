'use strict';
// const http = require('http')
const querystring = require('querystring')
// so, prank'd myself, but we're not in a module. We should be but we aren't. So gotta go with require syntax.
// the node docs, as it turns out, defaults to showing you the ESM version
// import * as fs from 'fs/promises';   // using promise api over sync api (which is just 'fs')
const fs = require('fs/promises');   // using promise api over sync api (which is just 'fs')

const express = require('express')
const discord = require('discord.js')
const axios = require('axios');
const { url } = require('inspector');

const app = express()

// const client = new discord.Client()

/* I had a small misunderstanding - 
    OAUTH2 grants are for acting on behalf of users. Not necessarily bots-
    so it's for e.g taking actions on their behalf, such as 
        * registering a webhook
        * reading their messages
        * updating their "now playing" list
        * doing other stuff
    and for linguine, we want a bot. bot I am going to play around with this side of the coin,
    out of interest. May come in handy for other purposes later.
 */
// const client = new discord.ClientUser()
const client = new discord.Client()

const hostname = `${process.env.BIND_IP ?? '0.0.0.0'}`
const port = `${process.env.BIND_PORT ?? 8080}`
const token = `${process.env.DISCORD_TOKEN}`

console.log({ hostname, port })

// One thing we can use oauth for is verification - logging into the web panel with a valid OAUTH token
// then only people with the correct permission can login.

const joined_guilds = []

const guilds = {
}

const webhooks = {

}

const register_links = {
    // registers a bot AND a webhook, separately
    "oauth2_bot_webhook": "https://discord.com/api/oauth2/authorize?client_id=846454323856408636&permissions=68608&redirect_uri=https%3A%2F%2Flinguine.hfarr.net%2Fapi%2Ftoken&response_type=code&scope=bot%20webhook.incoming",
    // won't work because I do not request a code grant
    "bot_only": "https://discord.com/api/oauth2/authorize?client_id=846454323856408636&permissions=68608&redirect_uri=https%3A%2F%2Flinguine.hfarr.net%2Fapi%2Ftoken&scope=bot",
}

const CURRENT_LINK = register_links["oauth2_bot_webhook"]

app.get('/', (req, res) => {
    //     res.send(`<p>Register a webhook</p>
    // <a href=https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=https%3A%2F%2Flinguine.hfarr.net%2Fapi%2Ftoken&response_type=code&scope=messages.read>register token</a>`)
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
// might have to use 
const REDIRECT_URI = 'https://linguine.hfarr.net/api/token'
// const REDIRECT_URI = 'https://linguine.hfarr.net/success'

// this should be a promise
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

    // let response

    // axios.post(API_ENDPOINT, data)
    return axios(options)
    // .then(res=>{
    //     console.log(`Status: ${res.status}`)
    //     console.log(res.data)
    //     response = res
    // })
    // .catch(error=> {
    //     console.error("Error :(")
    //     // console.error(error.message)
    //     console.error(error)
    // })
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
        // .then(tokdata => { res.send(`Token received? ${tokdata === undefined ? 'No :(' : `yes!\n${JSON.stringify(tokdata.data)}`}`) })
        .catch(error => {
            console.error("Error :(")
            console.error(error)
            res.send('Error registering bot')
        })

})


// TODO add to persistent DB
function new_registration(info) {
    // TODO save info to file as json string
    let { access_token, refresh_token, token_type, guild, webhook } = info

    // how we'll identify the bot
    let guild_id = guild["id"]
    joined_guilds.push(guild_id)

    let guild_info = {
        tok: access_token,
        refresh_tok: refresh_token,
        token_type: token_type,
        user_data: {},
    }
    guilds[guild_id] = guild_info   // TODO save to a db

    // only saving one webhook to a guild for this bot, so we won't make it a list
    let { id, token, channel_id } = webhook
    webhooks[guild_id] = { id, token, channel_id }

}

function send_message(guild_id, message) {

    // let { id, token, channel_id }= webhooks[guild_id]
    // let webhook = discord.WebhookClient(...webhooks[guild_id])
    client.fetchWebhook(webhooks[guild_id])
        .then(webhook => webhook.send(message))
        .catch(console.error)
}

function parse_user_mention(mention_string) {
    const user_match = /\D*(?<id>\d+).*/
    let { groups: { id: result = null } = {} } = user_match.exec(mention_string) ?? {}
    return result
}

function get_user(guild_id, user_id) {
    return new Promise((resolve, reject) => {
        client.guilds.fetch(guild_id)
            .then(guild => guild.member(user_id))
            .then(resolve)
            .catch(reject)
    })
}

// TODO should register these functions into guild_info on start up, or when 
// read from a database. In other words instantiate an object properly, why don't we... :S
// (comment taken from below) TODO data base op, and when reading from database, querying you might say, it will default to 0 instead of this nonsense
function get_points(guild_info, user_id) {
    // Fetch users' points. If they're data isn't tracked, default to 0.
    let { points: current_points = 0 } = guild_info['user_data'][user_id] ?? {}
    // let { user_id: { points: current_points = 0 } = {} } = guild_info['user_data'] // p-sure this line does the same as the above, advanced destructuring! but less clean.
    // lets be real, neither are clean, this is not clear code but I like it so it stays until I upgrade to classes
    return current_points
}
function get_linguines(guild_info, user_id) {
    // Fetch users' points. If they're data isn't tracked, default to 0.
    let { linguines: current_linguines = 0 } = guild_info['user_data'][user_id] ?? {}
    return current_linguines 
}

// TODO another function to make into a database op
function add_points(guild_id, user_id, points) { // todo should check points > 0, or have that as a DB constraint or something.
    let guild_info = guilds[guild_id] // assuming this is undefined, returns valid 'guild_info' object
    let new_points = get_points(guild_info, user_id) + points

    // TODO un-hardcode 100, parameterize in guild_info
    if (new_points >= 100) {
        get_user(guild_id, user_id)
            .then((usr) => { send_message(guild_id, `${usr.toString()} has earned a Linguine.`)})
        add_linguine(guild_info, user_id)
        new_points = 0
    }

    if (guild_info['user_data'][user_id] === undefined ) { // we weren't tracking them before
        guild_info['user_data'][user_id] = {}
    }

    // TODO db op! golly gee whillickers!
    guild_info['user_data'][user_id]['points'] = new_points
}

function add_linguine(guild_id, user_id, linguines = 1) { // todo should check linguines > 0, or have it as a DB constraint. Golly.
    let guild_info = guilds[guild_id] // assuming this is undefined, returns valid 'guild_info' object
    let new_linguines = get_linguines(guild_info, user_id) + linguines

    if (guild_info['user_data'][user_id] === undefined ) { // we weren't tracking them before
        guild_info['user_data'][user_id] = {}
    }
    guild_info['user_data'][user_id]['linguines'] = new_linguines
}

function points_command(msg, [user, points_str]) {

    let guild_id = msg.guild.id
    let guild_info = guilds[guild_id]   // TODO database op to retrieve! async

    // arguments in the deconstruction are either strings or undefined, unless someone pulls a big prank. in a module it wouldnt be an issue :eye_roll: because this code would be hidden
    if (user !== undefined) {

        // Ive found that in substr using offset of 0 and 1 back from length yield the same string! seems inconsistent.
        // Slice on hte other hand operates on arrays, and when a string becomes arrays it is given the code point treatment, so we don't have to worry about off by one 
        // code unit errors (I think, at least. Need to experiment and read more of Horstmann)
        // UPDATE: okay lol so big CAUTION text on page 117. If the second arg to substring is bigger, the ARGUMENTS GET SWITCHED (why!)
        //      horstmann prefers slice, and I think I do too. Read the text for his reasoning
        let points_recipient_id = parse_user_mention(user) // Retrieve snowflake of mentioned user
        let points_recipient = msg.guild.member(points_recipient_id)

        if (points_recipient !== null) {    // Successfully parsed a user on this guild
            let current_points = get_points(guild_info, points_recipient_id)

            let points = parseInt(points_str)
            if (points > 0) {
                add_points(guild_id, points_recipient_id, points)
                let new_total = guild_info['user_data'][points_recipient_id]['points']
                msg.channel.send(`${msg.author.toString()} gave ${points_recipient.toString()} ${points} points! New total: ${new_total}`)
            } else {
                msg.channel.send(`${points_recipient.toString()} has ${current_points} points.`)
            }
        }
    }
}

function linguines_command(msg, [user]) {
    let guild_id = msg.guild.id
    let guild_info = guilds[guild_id]

    if (user !== undefined) {
        let user_id = parse_user_mention(user) // discord snowflake (not perfect - I need to do some regex :S)
        let member = msg.guild.member(user_id)

        if (member !== null) {
            let current_linguines = get_linguines(guild_info, user_id)
            msg.channel.send(`${member.toString()} has ${current_linguines} linguines.`)
        }
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
        msg.reply(`You sent command \`${msg.content.slice(1)}\``)
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
            await fs.rm('/tmp/apps/linguine.socket', { force: true, }) // since we're the maintainers of this file, it should be okay, but overall not too great?
        } catch (err) {
            console.log(err.message);
            console.log("Proceeding")
        }
        // like Ideally we are 'free'ing resources after the program exits. I almost want to write a wrapper process that manages these socket files
        // for a process, and when it terminates, delete any files it acquired. Becauase the socket sticks around on termination. And we can't guarantee
        // we're going to go through the signal handler!
        app.listen('/tmp/apps/linguine.socket')
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
            server.close(() => {
                console.log('Process terminated')
            })
            // hope that this line executes
            // TODO - this needs to be in an async block, which this event handler is not apparently
            // await fs.rmdir('/tmp/apps/linguine.socket', { force: true, }) // since we're the maintainers of this file, it should be okay, but overall not too great?

        });
    } catch (err) {
        console.log(err)
    }
})();
