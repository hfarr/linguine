'use strict';
import querystring from 'querystring'

// TODO double check imports
import Interactor from './interaction.mjs'
import { Predicate } from './interaction.mjs'

import { LinguineRedeemer, LinguineMember } from './linguine/redeemer.mjs'

import express from 'express'
import discord from 'discord.js'
import axios from 'axios'
import Redis from 'ioredis'; // https://github.com/luin/ioredis
import date from 'date-and-time'
import InteractionContext from './interactions/interactionContext.mjs';

const app = express()

const DEV = process.env.DEV === 'true'
console.debug(`DEV ${DEV} has type ${typeof DEV}`)

const client = new discord.Client()
const token = `${process.env.DISCORD_TOKEN}`

const DB_HOST = "redis" // docker bind - Parameterize this
const redis = new Redis(DB_HOST);

// One thing we can use oauth for is verification - logging into the web panel with a valid OAUTH token (with identity scope, likely)
// then only people with the correct permission can login.

// This link lets someone register their bot to a server, and set up a webhook. 
// TODO gracefully handle cases where necessary permissions are not granted.
const CURRENT_LINK = process.env.BOT_LINK

app.use('/interaction', express.json())
app.all('/interaction', async (req, res) => {

  let body = req.body
  let handlerResponse = undefined
  if (body !== undefined) {
    console.debug("-----------------------------------------------------------------\nReceived interaction\n-----------------------------------------------------------------")
    // console.debug(body)
    try {
      handlerResponse = await Interactor.handle(body)
    } catch (e) {
      console.error(e)
    }
  }

  if (handlerResponse !== undefined) {
    console.debug("Non nonsense response:\n", handlerResponse)
    res.status(200).json(handlerResponse)
  } else {
    console.debug('No response from handler - unhandled?')
    res.status(500)
  }
})


app.get('/', (req, res) => {
  res.send(`<h1>Add linguine to your server</h1>
<p>Click <bold><a href=${CURRENT_LINK}>here</a></bold> to complete the bot registration work flow.</p>`)

})

app.get('/success', (req, res) => {
  res.send('Hi! Glad you joined us')
})

app.get('/no', (req, res) => {
  res.redirect('/')
})

const API_OAUTH_TOKEN_ENDPOINT = 'https://discord.com/api/oauth2/token'
const CLIENT_ID = `${process.env.CLIENT_ID}`
const CLIENT_SECRET = `${process.env.CLIENT_SECRET}`
// might have to use. Im not 100% positive what happens when you give a different redirect to the one used for code granting.
const REDIRECT_URI = process.env.REDIRECT_URI
console.log(REDIRECT_URI)

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
    url: API_OAUTH_TOKEN_ENDPOINT,
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
  // res.status(503).send("Registration temporarily unavailable")
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

// TODO opposite of this for bot removed. This means cleaning out the DB.
function new_registration(info) {
  // console.error("Registrations temporarily closed");
  // return
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
  if (token === undefined) {
    console.error("Failed to register bot, missing webhook data (Bad API response?)")
    console.error(webhook)
    console.error(info)
  }
  // console.log(`WEBHOOK?`, webhook)

  // save in db
  redis.pipeline()
    .rpush('joined_guilds', guild_id)                       // All guilds to which this bot has ever been added. Take note, if the bot is removed, it is NOT removed from this list - for now
    .set(`discordInfo:${JSON.stringify(info)}`)             // Original response from discord in case we need to recover state
    .set(`guilds:${guild_id}`, JSON.stringify(guild_info))  // TODO use a redis hash, or zmap or whatever
    .set(`webhooks:${guild_id}`, JSON.stringify(hook))      // yeah. storing JSON strings... not the best?
    .exec((err, results) => { })                             // TODO error handling. lots of work pushed off today..

}

// This only applies to numbers, since the automatic default Im DECLARING to be 0.
// This is a good case for generics. Other types might have default values of their type, so if v and dv are 
// constrained to the same type, then I can apply the default value of the type for dv if it 
// goes unspecified. Moreover we can specify a "constraint" predicate rather than checking if v is not null, is not undefined
// This function returns v unless it is null or undefined, then it returns a default value. Numerics only (for now)
// could probably use Number.isNan, which would cover the null, undefined, and unparseable cases
const valueOrDefault = (v, dv = 0) => Number.isFinite(v) ? v : dv
const compose = (f, g) => x => f(g(x))   // Im glad the notation is flexible lol, feels closer to haskell

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

      // "get" expressions are not wrapped in braces { } to use the 'default return' syntax for arrow functions
      // TODO redis error handling. Also TODO this may not be the best way to use an async pattern.
      // could use multiple redis connections and name space the keys... hmm
      guildInfo.getPoints = (userID) => redis.get(`${guildID}:${userID}:points`).then(transformValue);
      // .then((ps) => { let p = transformValue(ps); console.log(`Got points ${p}`); return p });
      guildInfo.getLinguines = (userID) => redis.get(`${guildID}:${userID}:linguines`).then(transformValue);
      // .then((ps) => { let p = transformValue(ps); console.log(`Got linguines ${p}`); return p });

      // "set" expressions are wrapped in braces { } to indicate function body, and by default return undefined
      // yes technically we don't need to set the expiration if the points exist already but that micro optimization is not worth the effort.
      guildInfo.setPoints = (userID, points) => { redis.setex(`${guildID}:${userID}:points`, Math.trunc(secondsTill4am()), points) }
      guildInfo.setLinguines = (userID, linguines) => { redis.set(`${guildID}:${userID}:linguines`, linguines) }

      guildInfo.getAllLinguines = async () => {

        // let fetcher = await client.guilds.fetch(guildID).then(g => id => g.members.fetch(id))
        let guild = await client.guilds.fetch(guildID)
        const fetcher = id => guild.members.fetch(id)

        // pairwise map and not object because an object is hashed when used on a key (however JS implements that), which can cause potential info loss.
        //  well. In particular I believe toString() is called, not any kind of hash method.
        const zip = (ks, vs) => ks.map((k, i) => [k, vs[i]])

        let sliceParams = [`${guildID}:`.length, -':linguines'.length]
        let usrIDS = await redis.keys(`${guildID}:*:linguines`).then(ks => ks.map(k => k.slice(...sliceParams)))

        // wanted to use compose with redis.get and transform value :/ maybe a Promise compose. because then the work of transforming value to int doesnt have to
        // happen in a loop pass at the end
        // note: usrKeys.map(redis.get) did not work, i suspect passing the ioredis redis.get as a function vs using it 
        //    explicitly in an arrow function makes a difference, because it supports different use cases. (promise api, 
        //    which Im using, and a more traditional synchronous kind)
        //    moreover: ioredis has a pipelining feature which would be better to use rather than initiating many separate calls out
        // return Promise
        //   .all(usrKeys.map(k => redis.get(k)))  
        //   .then(linguineValues => zip(usrKeys, linguineValues.map(transformValue)))
        return Promise
          .all([
            Promise.all(usrIDS.map(fetcher)),
            Promise.all(usrIDS.map(guildInfo.getLinguines))
          ])    // yeah this is slightly a hackjob
          .then(([userVals, linguineValues]) => {
            // console.log(userVals, linguineValues)
            return zip(userVals, linguineValues.map(transformValue))
          })
      }

      // closure! capturing guildID
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
    .then(({ id, token }) => client.fetchWebhook(id, token))    // have id, calling another Promise. // HOTFIX required to pass token because the fetch will return a webhook without one if we don't
    .then(webhook => webhook.send(`${DEV === true ? '(debug) ' : ''}${message}`))
    .catch(console.error)
}

// Parse an ID from user mention in discord, which wraps it in angle brackets and varying 
// other symbols (I've seen !, &, and plain- not sure exactly what they indicate)
function parseUserMention(mention_string) {
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
      let [pointsToSet, newLinguines] = [(newPoints % 100), Math.trunc(newPoints / 100)]
      guildInfo.setPoints(user_id, pointsToSet)

      if (newLinguines > 0) {
        add_linguines(guild_id, user_id, newLinguines)
        get_user(guild_id, user_id)
          .then(usr => guildInfo.sendMessage(`${usr.toString()} has earned ${newLinguines === 1 ? `a Linguine.` : `${newLinguines} Linguines.`}`))
      }
      return pointsToSet
    })
}

// TODO guards (data constraints).
// Linguines cannot be below 0
function add_linguines(guild_id, user_id, linguines = 1) {
  let guildInfo   // maybe create syntax for "with" scopes, so you can specify variables available in all promises, or bind results available to succeeding pipelined function?
  return Promise.resolve()
    .then(() => getGuildInfo(guild_id))
    .then(gi => { guildInfo = gi; return guildInfo.getLinguines(user_id) })
    .then(oldLinguines => oldLinguines + linguines)
    .then(newLinguines => { guildInfo.setLinguines(user_id, newLinguines); return newLinguines })
}

function removeLinguines(guild_id, user_id, linguines = 1) {
  return add_linguines(guild_id, user_id, -linguines)
}

async function points_command(msg, [user, points_str]) {

  let guild_id = msg.guild?.id

  if (guild_id === undefined) {
    console.log(`(Points command) no guild id, was the message sent in a guild? Exiting method`)
    return
  }

  // arguments in the deconstruction are either strings or undefined, unless someone pulls a big prank. in a module it wouldnt be an issue :eye_roll: because this code would be hidden
  if (user === undefined) { // no argument to !points, so pretend the requesting user passed themselves as an argument
    user = msg.author.id
  }

  // Ive found that in substr using offset of 0 and 1 back from length yield the same string! seems inconsistent.
  // Slice on hte other hand operates on arrays, and when a string becomes arrays it is given the code point treatment, so we don't have to worry about off by one 
  // code unit errors (I think, at least. Need to experiment and read more of Horstmann)
  // UPDATE: okay lol so big CAUTION text on page 117. If the second arg to substring is bigger, the ARGUMENTS GET SWITCHED (why!)
  //      horstmann prefers slice, and I think I do too. Read the text for his reasoning
  let points_recipient_id = parseUserMention(user) // Retrieve snowflake of mentioned user
  let points_recipient = msg.guild.member(points_recipient_id)
  let authorAsGuildMember = msg.guild.member(msg.author)

  let guildInfo = await getGuildInfo(guild_id)

  if (points_recipient !== null) {    // Successfully parsed a user on this guild

    let points = parseInt(points_str)
    if (points > 0) {
      // let new_total = guild_info['user_data'][points_recipient_id]['points']
      let newTotal = await add_points(guild_id, points_recipient_id, points)
      msg.channel.send(`${DEV === true ? '(debug) ' : ''}${authorAsGuildMember.displayName} gave ${points_recipient.displayName} ${points} points! New total: ${newTotal}`)
        .catch((err) => {
          console.log(`Failed to send message: ${err.message}. Trying webhook.`)
          // tag them as notification
          guildInfo.sendMessage(`${authorAsGuildMember.toString()} gave ${points_recipient.displayName} ${points} points! New total: ${newTotal}`)
        })    // failed to send
    } else {
      let curPoints = await guildInfo.getPoints(points_recipient_id)
      msg.channel.send(`${DEV === true ? '(debug) ' : ''}${points_recipient.displayName} has ${curPoints} point${curPoints === 1 ? '' : 's'}.`)
        .catch((err) => {
          console.log(`Failed to send message: ${err.message}. Trying webhook.`)
          // tag them as notification
          guildInfo.sendMessage(`${authorAsGuildMember.toString()}, ${points_recipient.displayName} has ${curPoints} point${curPoints === 1 ? '' : 's'}.`)
        })    // failed to send

    }
  }
}

async function linguines_all_command(msg) {
  let guildID = msg.guild?.id
  if (guildID === undefined) {
    console.log(`(Linguines all command) no guild id, was the message sent in a guild? Exiting method`)
    return undefined
  }

  let linguineState = await getGuildInfo(guildID).then(g => g.getAllLinguines())
  let userLinguineAnnouncements = linguineState
    .filter(([user, linguines]) => linguines > 0)
    .sort(([_x, x], [_y, y]) => y - x)
    .map(([user, linguines]) => `${user.displayName} has ${linguines} linguine${linguines === 1 ? '' : 's'}`)

  msg.channel.send(`${DEV === true ? `(debug) ` : ''}Outstanding Linguines:\n${userLinguineAnnouncements.join('\n')}`)
}

/**
 *
 * @param msg Original message (discordjs object)
 * @param param1 Tokenized arguments (minus the first, which for this command is always `linguines`)
 * @returns undefined
 */
async function linguines_command(msg, [arg2]) {
  let guild_id = msg.guild?.id
  if (guild_id === undefined) {
    console.log(`(Linguines command) no guild id, was the message sent in a guild? Exiting method`)
    return undefined
  }

  // TODO change command dispatch. Would prefer if command methods did not short out to different commands, unless it's some sort of aggregate command
  //    better yet, separate the command dispatch from the 'API' accessing linguine internals. Can implement API methods which commands can call on.
  //    instead of this hot spaghetti mess.
  if (arg2 === 'all') { // not processing linguines for users, jump to different command
    linguines_all_command(msg);
    return undefined
  }

  if (arg2 === undefined) { // grab points of message sender if no arg supplied
    arg2 = msg.author.id
  }

  let authorAsGuildMember = msg.guild.member(msg.author)
  let user_id = parseUserMention(arg2)
  let member = msg.guild.member(user_id)

  if (member !== null) {
    let guildInfo = await getGuildInfo(guild_id)
    let curLinguines = await guildInfo.getLinguines(user_id)
    msg.channel.send(`${DEV === true ? '(debug) ' : ''}${member.displayName} has ${curLinguines} linguines.`)
      .catch((err) => {
        console.log(`Failed to send message: ${err.message}. Trying webhook.`)
        guildInfo.sendMessage(`${authorAsGuildMember.tag}, ${points_recipient.displayName} has ${curLinguines} point${curLinguines === 1 ? '' : 's'}.`)
      })
    // msg.channel.send(`${DEV === true ? '(debug) ' : ''}${member.toString()} has ${current_linguines} linguine${current_linguines === 1 ? '' : 's'}.`)
  }

  // Function is executed for effect
  return undefined
}

async function admin_command(msg, args) { // no arguments are used for now. Just brings up the admin panel
  let guildID = msg.guild.id
  // let authorAsGuildMember = msg.guild.member(msg.author)
  let authorAsGuildMember = await msg.guild.members.fetch(msg.author)
  let guildInfo = await getGuildInfo(guildID)

  console.debug(`Message author: ${msg.author} from guild: ${msg.guild}`)
  console.debug(`Admin command invoked by ${authorAsGuildMember.displayName}/${authorAsGuildMember.tag}`)

  // do other tasks, e.g check authorization of calling member

  // TODO message
  msg.channel.send(`Hello ${authorAsGuildMember.tag}. Please visit ${guildInfo.webhook}.`)
  // Attempting to send new fangled message components, since it SEEMS like the library supports them but I dont think the docs are updated.
  //  may need to pull newer version.
  // TODO temp going through webhook- discordjs has commits in master which include WebComponents but not in any release (that I can see)
  //    so I may hotwire directly to the discord API. Or figure out how to update the package to point to master (which I think NPM supports)
  // msg.channel.send()

  let messageData = {
    content: `Admin panel requested by ${authorAsGuildMember.tag}`,
    components: [
      {
        type: 1,
        components: [
          {
            custom_id: "LinguineAdmin",
            type: 2,
            label: "A label",
            style: 1, // any style can work
          },
          {
            custom_id: "LingoBingo", // maybe ID per user ? use label? need to establish a pattern for using buttons, there is only so much data we can transmit
            type: 2,
            label: "Another button",
            style: 2,
          },
          {
            custom_id: "Lastly", // maybe ID per user ? use label? need to establish a pattern for using buttons, there is only so much data we can transmit
            type: 2,
            label: "Ah ha! wait just a button",
            style: 3,
          }
        ]
      }
    ]
  }

  guildInfo.sendMessage(messageData)

}

// TODO better commands. Integrate w/Discord interactions (i.e make slash commands instead)
// Command parsing should be a """framework""" which does a few things on each command -
//  * fetching guild information (for response messages), 
//  * fetching membership information
//  * in effect, anything the DiscordJS would bundle with its created objects, because that strives for 1-1 correspondance and enabling each of these behaviours.
//  and its okay if e.g the guild info goes unused, right? we accept these excesses whenever we abstract out to another level

// Commands are called by passing the message object as the first argument, then additional tokens in a list as the second argument.
//    ... could probably Spread them out into regular function arguments. TODO. perhaps
const CMD_PREFIX = '!'
const COMMANDS = {
  points: points_command,
  linguines: linguines_command,
  // admin: admin_command,
}

function cmdParse(text) {
  let argMatcher = /(?<arg>\S+)(?:\s*)/g
  let matches = text.matchAll(argMatcher)
  let cmdArgs = [...matches].map(m => m.groups.arg)

  return cmdArgs
}

// Everything after the !
// TODO make this a "registered commands" deal, so we don't have to explicitly know what commands are registered, this just calls the relevant handler
//  if it matches. We register a handle for matching patterns when needed.
function handle_cmd(msg) {
  let [command, ...args] = cmdParse(msg.content)

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




//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let commandRemove = "linguines-remove"
let commandLinguines = "linguines"
let commandLinguinesRedeem = "redeem"

// Custom IDs
let componentRedemptionCancel = "redemption_cancel"
let componentRedemptionSignoff = "redemption_witness_signoff"
let componentRedemptionFinish = "redemption_finish"

// TODO - 
let commandsAsRegistered = [
  {
    name: "linguines",
    description: "",
    options: [
      {
        name: commandRemove, // TODO does this name group with the name of global commands? i.e it should be unique among all commands/subcommands
        // Or do I have to read this from options->...->options->name for each level of nesting?
        description: "",
        type: 1, // subcommand
        options: [
          {
            "name": "user",
            "description": "",
            "type": 6, // 6 is type USER
            "required": true
          },
        ]
      }
    ]
  },
  {
    // <linguines redeem>
  }
]

/* 
 * Initiate linguine removal process. Expires in 10 minutes.
 * TODO handle both the 'redeem' case and 'remove' case? 'remove' is more like an administrative action, Im not sure what circumstances warrant 
 *    any kind of multi redemption.
 */
function initiateLinguinesRedemption(interactionData) {
  /*
   *  Process is as follows:
   *    Initiated by one of
   *      - invocation of "/linguines remove @<user> <amount>" (possibly put this under administrative action, since the use case is less frequent. UX!)
   *      - (short hand) invocation of "/linguines redeem @<user>"  (removes one linguines
   *    Prompts for witness confirmation. Removal requires at least one admin and one non-admin.
   *      The initator of linguine removal is automatically set as one of the witnesses, the channel is prompted for the other (as a response to the interation).
   *      The linguine redemee cannot sign off as a witness to their own redemption.
   *        Although they CAN initiate the process
   *    In the same prompt there is a disabled "done" button. The button enables once the witness requirements are fulfilled.
   *    Anyone can click done to finish up the process
   * 
   *  The process occurs over a series of interactions, starting with the initiator interaction. Then it moves to witness self-selection,
   *    which can include any number of message component selection interactions.
   *    Finally, the "done" message component interaction signals an end.
   * 
   *    The redemption will be recorded in the webhook'd channel, listing the redeemee, the date, and every witness who signed off (ideally as an embeds object for
   *    beautification).
   * 
   * The process expires after 10 minutes if not resolved, after which time the witness prompt message is updated to reflect the status.
   * Another redemption will have to be initiated.
   */

  console.debug("Handling 'linguines redeem'")
  // If it passes the predicate, then we *SHOULD* be able to assume the presence of each value.
  let {
    token: continuationToken,
    data: { options: [{ options: [{ value: redeemeeID }] }] },  // we know the first option is the 'redeem' subcommand, so we just unpack it
    member: initiatorMember
  } = interactionData

  // if (hasAdminPerms(userData)) ...

  let { id: initiatorID, permissions: permissionsInt } = initiatorMember.user

  if (initiatorMember === undefined) {
    return Interactor.immediateMessageResponse("This command does not work in DMs")
  }

  let redeemeeMember = interactionData.data.resolved.members[redeemeeID]
  let redeemeeUser = interactionData.data.resolved.users[redeemeeID]

  let initiator = new LinguineMember(initiatorMember, initiatorMember.user)
  let redeemee = new LinguineMember(redeemeeMember, redeemeeUser)

  if (LinguineRedeemer.trialExistsFor(redeemee)) {
    return Interactor.immediateMessageResponse(`There is already a trial in progress for ${redeemee.name}.`, true)
  }

  let redemptionTracker = new LinguineRedeemer(interactionData, redeemee, initiator)
  redemptionTracker.witnessSignoff(initiator)  // Add the initiator as a witness. If this fails (i.e the initator is also the redeemer) it doesn't impact us here.

  return redemptionTracker.response


  // respond with the prompt message. Possibly the Progress tracker does this instead.
  return // .... InteractionResponse (msg prompt)

}

// function cancelLinguinesRedemption(interactionData) {
function cancelLinguinesRedemption({ message: { interaction: { id } } }) {
  console.debug("Handling cancel interaction!")

  // TODO only cancel if the canceller is the initiator or has administrative privileges
  InteractionContext.fetchByID(id).cleanup()

  return Interactor.immediateMessageResponse("Cancelled redemption!", true)
}

function linguinesRedemptionSignoff(interactionData) {
  console.debug("Handling witness signoff")

  let { member: signeeMember, message: { interaction: { id: previousID } } } = interactionData
  let signeeUser = signeeMember.user
  let signee = new LinguineMember(signeeMember, signeeUser)

  let redemptionTracker = InteractionContext.fetchByID(previousID)
  let { success, reason } = redemptionTracker.witnessSignoff(signee)

  if (!success) {
    return Interactor.immediateMessageResponse(reason, true)
  }

  return redemptionTracker.updateResponse

  // return Interactor.immediateMessageResponse("Witnessing registered", true)
}

function linguineRedemptionFinish(interactionData) {
  console.debug("Handling redemption finish")

  let { guild_id: guildID, message: { interaction: { id: previousID } } } = interactionData

  let redemptionTracker = InteractionContext.fetchByID(previousID)

  if (redemptionTracker.finish()) {

    let redeemee = redemptionTracker.redeemee
    redemptionTracker.cleanup()
    removeLinguines(guildID, redeemee.id, 1)

    return Interactor.immediateMessageResponse(`${redeemee.name} has been redeemed.`)

  } else {

    return Interactor.immediateMessageResponse(`This redemption has already concluded.`, true)
  }

}

function initHandlers() {
  Interactor.addHandler(
    initiateLinguinesRedemption,
    Predicate.or(Predicate.command(commandRemove), Predicate.command(commandLinguines, commandLinguinesRedeem)))
  Interactor.addHandler(
    cancelLinguinesRedemption,
    Predicate.componentButton(componentRedemptionCancel))
  Interactor.addHandler(
    linguinesRedemptionSignoff,
    Predicate.componentButton(componentRedemptionSignoff))
  Interactor.addHandler(
    linguineRedemptionFinish,
    Predicate.componentButton(componentRedemptionFinish))
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

{ // Not necessary to block in the initialization but I desire restricted scope. Also at the moment no need for async/await here
  console.log("Begin")

  let { BIND_IP = '0.0.0.0', BIND_PORT = 8000 } = process.env

  let [ip, port] = [BIND_IP, parseInt(BIND_PORT)]
  if (Number.isNaN(port)) {
    console.error(`${port} is not a number`)
    process.exit(1)
  }

  try {

    let appServer = app.listen(port, ip)
    console.log(`Server listening on ${ip}:${port}`)

    appServer.on('close', (error) => {
      console.log("Server SHOULD close")
      if (error !== undefined && error !== null) {
        console.log("Error closing?", error)
      }
    })

    // discord client login. App will run if this fails, so I can test locally without using my legit credentials.
    // But other uses of client will also err - really this makes a case for modules! Its fine if we can't use the client, but 
    // we should still see the web app!


    if (!process.env.NO_CLIENT_LOGIN) {
      client.login(token).catch((err) => { console.log(`Could not log in discord client: ${err.message}`) })
    } else {
      console.debug("Cancelled client login.")
    }

    initHandlers()

    // process.stdout.write("Ahh")
    console.log("Am I reached?")

    process.on('SIGTERM', () => {

      // Disconnect and delete client
      client.destroy()

      // Disconnect redis (using quit() over disconnect() is the graceful approach)
      redis.quit(false)

      // Cancel active 'trials' (because their timeouts prevent us from shutting down)
      // I guess after a point we could also sigkill ourselves to do ultra cleanup
      // But in this way our messages get cleaned up too! (at least in theory)
      LinguineRedeemer.cancelAll()

      // Close the server
      appServer.close(() => {
        console.log("Process terminated")
        appServer.getConnections((err, count) => {
          if (err !== undefined) {
            console.error("Error getting connections?", err)
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
    console.error(err)
  }
}
