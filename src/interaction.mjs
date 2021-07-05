'use strict'

import axios from 'axios';

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

// Hmm
// Should we go Ham in our API implementation? like discordjs? I think not
function InteractionResponse() {}
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



// construct the handler as an interface of sorts, to describe what a handler looks like?
// instead of a concrete? maybe later
// e.g SlashCommandInterHandler, ComponentInterHandler
// class InterfaceInteractionHandler {  // or InteractionHandlerMixin, or both

// }

// A handler receives interactions and either handles them or doesn't
//  Constructed with a handlermethod, which describes actions to take if 
//  the spplied predicate evaluates to true for a given interaction
//
//  An interaction can only be handled once
class InteractionHandler {

  constructor(handlerMethod, predicate) {
    this.handlerMethod = handlerMethod
    this.predicate = predicate
  }

  // predicate
  shouldHandle(interactionEvent) {
    if (interactionEvent.handled) {
      return false
    }
    return this.predicate(interactionEvent)
  }

  handle(interactionEvent) {
    if (this.shouldHandle(interactionEvent)) {
      interactionEvent.handle()
      this.handlerMethod(interactionEvent)
    }
    return false
  }
}

class InteractionEvent {

  constructor(interactionData) {
    this.originalInteractionData = interactionData
    Object.freeze(this.originalInteractionData)
    console.debug('New InteractionEvent')
  }
  
  handled = false

  get interactionData() { return this.originalInteractionData }
  get handled() { return this.handled }

  handle() {
    this.handled = true
  }

}

// from a framework perspective - manually doing this boilerplate for every kind of object is a road to upsetti
// a preferred way is implement the pattern of 'unpacking' an object in a class constructor, by just
// specififying class fields. then it unpacks those objects into the instance of the class.
// 

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
    this.guld_id = guld_id
    this.channel_id = channel_id
    this.member = member
    this.user = user
    this.token = token
    this.version = version
    this.message = message

  }

}

class CommandInteraction extends Interaction {
}
class ComponentInteraction extends Interaction {
}

// promises to handle? so then we just do Promises.all or whatever
// tricky nugget - could lead to multiple handles. I expect a degree of mutual exclusion in handlers.
//    I think it would be *nice* to go full async here. But I do not want to sacrifice the ability to control
//    whether I use an immediate response or not.
let interactionHandlers = [
  (event) => Promise.reject('No handlers invoked'),
  // (event) => { return new Promise((resolve, reject) => {
  //   setTimeout(() => reject('No handlers invoked'), 1000)
  // })}
]

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
  let interactionEvent = new InteractionEvent(interactionData)
  // interactionHandlers.forEach(h => h(interactionEvent))
  
  // first handler to handle the interaction wins. This is okay because I expect that exactly one will, in most cases.
  // For now, I will conisder it an anti-pattern for more than one handler to 'handle' an interaction. Later I may wish to
  // incorporate some activities that happen for *any* or *arbitrary* interactions regardless of its handling status. For that
  // I think it would be better to use "listeners" which don't connote 'handling' an interaction in the same way. They may 
  // do other stuff but we don't have to wait for them.

  // TODO - mutual access to interaction event. Thankfully calling "handle()" is idempotent, we are immune to race conditions. But we aren't being careful,
  // and it is possible that multiple handlers read the handle value and see "ah, I can handle this" but the semantics of handling promote, once again,
  // one and only one handler, so getting that overlap is a problem. We just don't explicitly prevent it.
  let result = Promise.any(interactionHandlers.map(h => h(interactionEvent)))
    .catch((e) => {
      console.error(e.message)
      console.error(e.errors)
      return defaultResponse
    })
  console.debug('Handlers called')

  // what to return here? the first handler that response? 
  //  should be promises then. If none respond, i.e all promises reject - return a fail.
  return result
  /////////////////////////////////////////////////////

  // console.debug is an alias to console.log
  console.debug('Received interaction')
  console.debug(interactionData)

  let { id } = interactionData ?? {}
  let interaction
  if (id !== undefined) {
    interaction = getInteraction(id, interactionData)
  } else {
    console.log('Invalid ID!')
  }

  // prototype for linguine

  let { type } = (await interaction) ?? {}
  switch(type) {
    case InteractionTypes.ApplicationComment:
      return immediateResponse("I see you .. .")
    case InteractionTypes.MessageComponent:
      // let { data: { }}
      return immediateComponentResponse("Okay!")
    default:
      return immediateResponse(); // no data, no 'content', content is undefined so it shouldnt post a message
  }

    
}

async function addHandler(interactionHandler) {
  interactionHandler.push(interactionHandler)
}

export default { handle };


