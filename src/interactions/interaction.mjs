'use strict'

import axios from 'axios';
import InteractionContext from './interactionContext.mjs';
console.log(`Debug: ${typeof InteractionContext}`)

const DISCORD_CALLBACK_BASE = "https://discord.com/api/v8"


/** 
 * This module needs to track state for each interaction.
 * - Receipt of an untracked interaction generates new state (instance of an object)
 * - Such objects are ID'd and tracked by their interaction token
 * - Response to an interaction as part of its "conversation" are handled by the given object
 * - Reference to the object is removed when the interaction concludes
 *   (destroyed entirely, if we could - but I don't know how tight I can get the memory management here)
 *   - ... by expiring (after 15 minutes, the interaction token expires on the discrod sige, and we can no longer send responses)
 *   - ... if that given interaction concludes naturally (e.g a double round of back-and-forths with the inciting user)
 *   - ... if the bot restarts (because I don't want to incorporate the db right now, interactions are stored in the runtime memory)
 *      
 */

// Class time. Of course, I have about as much class as july. but jokes on me, as I have taken classes in july. multiple times
/*
class 
*/

// An interaction as described by the discord API
class Interaction {

  constructor(interactionData = {}) {
    // unpacking
    let { id, application_id, type, data, guild_id, 
      channel_id, member, user, token, version, message } = interactionData

    this.id = id
    this.application_id = application_id 
    this.type = type
    this.data = data
    this.guld_id = guild_id
    this.channel_id = channel_id
    this.member = member
    this.user = user
    this.token = token
    this.version = version
    this.message = message

  }

}

class ApplicationCommand extends Interaction {
}
class MessageComponent extends Interaction {
}

function categorizeInteraction(interactionData = {}) {
  let { id } = interactionData
  console.debug(`Creating object to represent interaction with id ${id}`)

  return new Interaction(interactionData)
}

const InteractionTypes = {
  Ping: 1,
  ApplicationComment: 2,
  MessageComponent: 3,
}

const InteractionCallbackTypes = { //https://discord.com/developers/docs/interactions/slash-commands#interaction-response-interactioncallbacktype
  Pong: 1,
  ImmediateMessageResponse: 4,  // Immediate response, appears as a "reply" to the user interaction. If its a component, responds to itself
  RespondLater: 5,  // Deferred response, appears as a loading state, until callback is made resolving to same as above
  DeferredUpdateMessage: 6, // (component only) Deferred response. No loading state. When callback made, original message is updated
  UpdateMessage: 7,         // (component only) Immediate response, updates original componentes message
}

// some of these names are a little hard to follow

// Respond immediately
function immediateResponse(content) {
  return { 
    type: InteractionCallbackTypes.ImmediateMessageResponse,
    data: content
  }
}
function immediateMessageResponse(message) {
  return immediateResponse({
    content: message,
  })
}

function immediateComponentResponse(content) {
  return {
    type: InteractionCallbackTypes.UpdateMessage,
    data: content
  }
}

// great naming..
function componentResponseNoMessage() {
  return {
    type: InteractionCallbackTypes.DeferredUpdateMessage
  }
}

// Hmm
// Should we go Ham in our API implementation? like discordjs? I think not
function ComponentInteractionResponse() {}

// In memory store of on-going interactions.
// Keyed by ID, value is an Interaction https://discord.com/developers/docs/interactions/slash-commands#interaction
const CurrentInteractions = {

}


// Returns interaction associated with snowflake, of which there can be at most 1
//  Will create if it does not exist or return an existing one
async function getInteraction(snowflake, data) {
  if ( !(snowflake in CurrentInteractions) ) {
    console.debug("TODO new interactions as classes")
    CurrentInteractions[id] = data
  }
  return CurrentInteractions[snowflake]
}

class Interactor {
  constructor(contexts) {
    this.interactionContexts = contexts // classes that can be instanced on receipt of a new interaction
  }
}

class CountEmUp extends InteractionContext {

  constructor(...args) {
    super(...args)
  }

  currentState = "initial"
  counter = 0
  incrID = `${this.uid}_incr`
  freezeID = `${this.uid}_freeze`

  initialStateComponents = [
    {
      type: 1, // ActionRow
      components: [
        {
          type: 2,  // button
          style: 2,  // "Secondary" grey button
          label: 'Increment', 
          custom_id: this.incrID,
        },
        {
          type: 2,  // button
          style: 1,  // "Primary" blurple button
          label: 'Freeze', 
          custom_id: this.freezeID,
        },
      ]
    }
  ]

  matchesAny(interactionCustomID) {
    let validIDs = [this.incrID, this.freezeID]
    for (let cid of validIDs) {
      if (cid === interactionCustomID)
        return true
    }
    return false
  }

  stateInitial(interaction) {
    console.log("INITIAL STATE INTERACTION")
    console.log(interaction.data)
    // console.log(interaction.data?.custom_id)

    if (interaction.data?.custom_id !== undefined) {

      if (interaction.data.custom_id === this.incrID) {
        this.counter++
        this.editOriginal({
          content: `Counter: ${this.counter}! ID: ${this.uid}`,
        })
      }

      // component interaction
      return componentResponseNoMessage()
    } else {
      // slash-command interaction - completely new instance
      return immediateResponse({
        content: `Counter: ${this.counter}! ID: ${this.uid}`,
        components: this.initialStateComponents,
      })
    }
    // unpack interaction
  }

  stateFrozen(interaction) {

  }

  shouldHandle(interaction) {
    if (super.shouldHandle(interaction)) {
      return true
    }
    if ( interaction.message !== undefined ) { // then the interaction is a component interaction. the message object should have an interaction object of itself, representing the original response we sent for this given chain.
      return interaction.message.interaction.id === this.initialInterID
    } 
    // I think I can jump straight to this.matchesAny(interaction.data?.custom_id)
    if (interaction.data?.custom_id !== undefined) {
      return this.matchesAny(interaction.data.custom_id)
    }
  }

  consume(interaction) {
    console.debug(`Consuming interaction from ${this.uid}`)
    // console.log(this.uid, this.interactionToken)
    // console.log(interaction.token)
    console.debug(interaction)
    switch(this.currentState) {
      case 'initial': 
        return this.stateInitial(interaction)
        break;
      case 'frozen': 
        break;
      default: 
        console.error("Invalid state")
    }

  }
}


// Promises~
let interactionContexts = []

let defaultResponse = immediateMessageResponse("Work in progress!")

// TODO Async methods in classes? I'd prefer to have a "HandlerEngine" or "InteractionEngine" objects instead of module level methods and variables
/**
 * Gateway for all interactions. Returns a promise that resolves when the given
 * request is handled - either by returning data for an "immediate response" type 4 interaction,
 * or without data as an acknowledgement for other interactions, potentially making a callback.
 * 
 * @param interactionData Interaction object from discord https://discord.com/developers/docs/interactions/slash-commands#interaction
 */
async function handle(interactionData) {  // creates AND handles an InteractionEvent

  ////////
  // let interactionEvent = new InteractionEvent(interactionData)
  // interactionHandlers.forEach(h => h(interactionEvent))
  
  // first handler to handle the interaction wins. This is okay because I expect that exactly one will, in most cases.
  // For now, I will conisder it an anti-pattern for more than one handler to 'handle' an interaction. Later I may wish to
  // incorporate some activities that happen for *any* or *arbitrary* interactions regardless of its handling status. For that
  // I think it would be better to use "listeners" which don't connote 'handling' an interaction in the same way. They may 
  // do other stuff but we don't have to wait for them.

  // categorize may not be the best verb. It creates an Interaction (either ApplicationCommand or MessageComponent)
  let interaction = categorizeInteraction(interactionData)

  // not very efficient - if we restrict ourselves to the idea that interactions belong to one and only one
  // context, then we should be able to just look up the context an interaction belongs to in constant time.
  // but I like the flexibility and don't particularly mind the cost we're paying with this O(n) invocation, for now.
  // plus this is global across all guilds dms! which could slow it down more. But no pre-optimizing.
  let existingContexts = [
    Promise.reject('No contexts used'),
    ...interactionContexts.map(handler => handler.handle(interaction))
  ]

  let result = Promise.any(existingContexts)
    .catch((e) => {
      console.error(e.message)
      console.error(e.errors)
      // No handlers took up the interaction - creating new handler
      // let newContext = new InteractionContext(interaction)
      let newContext = new CountEmUp(interaction)

      // need a way to remove these too
      interactionContexts.push(newContext)

      return newContext.handle(interaction)
    })
    .catch((e) => {
      console.error("Failed in handling")
      console.error(e)
      console.error(e?.message)
      return defaultResponse
    })
  console.debug('Handlers called')

  // what to return here? the first handler that response? 
  //  should be promises then. If none respond, i.e all promises reject - return a fail.
  return result
    
}

async function addHandler(interactionHandler) {
  interactionHandler.push(interactionHandler)
}

export default { handle };


