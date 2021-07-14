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
  ChannelMessageWithSource: 4,  // Immediate response, appears as a "reply" to the user interaction. If its a component, responds to itself
  DeferredChannelMessageWithSource: 5,  // Deferred response, appears as a loading state, until callback is made resolving to same as above
  DeferredUpdateMessage: 6, // (component only) Deferred response. No loading state. When callback made, original message is updated
  UpdateMessage: 7,         // (component only) Immediate response, updates original componentes message
}

// some of these names are a little hard to follow

// Respond immediately
function immediateResponse(content) {
  return {
    type: InteractionCallbackTypes.ChannelMessageWithSource,
    data: content
  }
}

function immediateComponentResponse(content) {
  return {
    type: InteractionCallbackTypes.UpdateMessage,
    data: content
  }
}

// In memory store of on-going interactions.
// Keyed by ID, value is an Interaction https://discord.com/developers/docs/interactions/slash-commands#interaction
const CurrentInteractions = {

}


// Returns interaction associated with snowflake, of which there can be at most 1
//  Will create if it does not exist or return an existing one
async function getInteraction(snowflake, data) {
  if (!(snowflake in CurrentInteractions)) {
    console.debug("TODO new interactions as classes")
    CurrentInteractions[id] = data
  }
  return CurrentInteractions[snowflake]
}


// Hmm
// Should we go Ham in our API implementation? like discordjs? I think not
function InteractionResponse() {

}

function ComponentInteractionResponse() {

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

  // Checks if event has already been handled. If not,
  // calls predicate with interaction data to determine if
  // this handler should handle the interaction.
  shouldHandle(interactionEvent) {
    if (interactionEvent.handled) {
      return false
    }
    return this.predicate(interactionEvent.interactionData)
  }

  // Process an interaction event, calling the handler
  // on it if appropriate.
  // Returns whether or not this handler handled the event.
  handle(interactionEvent) {
    if (this.shouldHandle(interactionEvent)) {
      interactionEvent.handle()
      this.handlerMethod(interactionEvent)
      return true
    }
    return false
  }
}

class InteractionEvent {

  constructor(interactionData) {
    this.interactionDataBody = interactionData
  }

  handled = false

  get interactionData() { return this.interactionDataBody }
  get handled() { return this.handled }

  handle() {
    this.handled = true
  }

}

// An interaction as described by the discord API
class Interaction {

  constructor(interactionData) {

  }

}

class CommandInteraction extends Interaction {
}
class ComponentInteraction extends Interaction {
}


let interactionHandlers = []

// TODO Async methods in classes? I'd prefer to have a "HandlerEngine" or "InteractionEngine" objects instead of module level methods and variables
//  ^^^ Side note, this is not "async safe"? Should likely read up on safety in async. ATM it calls each handler synchronously. But I thought
//      I did this work already. Did I chuck it out in favor of the simpler yet not as satisfying synchronous solution?
/**
 * Gateway for all interactions. Returns a promise that resolves when the given
 * request is handled - either by returning data for an "immediate response" type 4 interaction,
 * or without data as an acknowledgement for other interactions, potentially making a callback.
 * 
 * @param interactionData Interaction object from discord https://discord.com/developers/docs/interactions/slash-commands#interaction
 */
async function handle(interactionData) {  // creates AND handles an InteractionEvent

  ////////
  // TODO
  console.debug("Handling interaction", interactionData)

  let interactionEvent = new InteractionEvent(interactionData)
  interactionHandlers.forEach(h => h.handle(interactionEvent))

  return
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
  switch (type) {
    case InteractionTypes.ApplicationComment:
      return immediateResponse("I see you .. .")
    case InteractionTypes.MessageComponent:
      // let { data: { }}
      return immediateComponentResponse("Okay!")
    default:
      return immediateResponse(); // no data, no 'content', content is undefined so it shouldnt post a message
  }


}

async function addHandler(handlerMethod, handlerPredicate) {
  const handler = new InteractionHandler(handlerMethod, handlerPredicate)
  interactionHandlers.push(handler)
}

export class Predicate {  // Mmmm Prefix notation. this is.. a baby DSL

  // Creates a predicate that matches an interaction for the invocation of a slash command
  // TODO accept a slash-command like object?
  static command(...commandChain) {   // command, command subcommand, command subcommandgroup subcommand ...
    // command or subcommand 
    // at least, I want this to work equivalently for both. handling a command WITH subcommands will indicate handling each of its subcommands.
    // otherwise, it traverses the sub(group|command) structure until it matches a name

    // inspect interactionData to see if the command matches
    return (interactionData) => {

      console.debug("Matching for", commandChain)

      // TODO stubbed
      let { type, data } = interactionData
      if (type === 2) { // its a command (APPLICATION_COMMAND that is, slash commands)
        // may just need name. could also go by id of command? mm but that differs. See.
        // we really need. a local reference of the commands we create.
        let { name: nameToCheck, options = {} } = data

        for (let matchName of commandChain) {
          console.debug("Looking to see if", matchName, "matches", nameToCheck)
          if (matchName !== nameToCheck) {
            return false
          }
          // iterate to the next command nesting layer 
          console.debug("Next layer of options:", options);
          ({ name: nameToCheck , options = {} } = options )
          console.debug(nameToCheck, options)
        }


        return commandNameToMatch === nameToCheck // works for subcommands?
      }
      return false
    }
  }
  
  // (TODO use race-style promises? and async predicates? and... async handlers?)
  // Creates a predicate that is true if any of its constituent predicates are true
  static or(...predicates) {
    return (interactionData) => {
      for (let p of predicates) {
        if ( p(interactionData) )
          return true
      }
      return false
    }
  }

  // Creates a predicate that is true if all of its constituent predicates are true
  static and(...predicates) {

    return (interactionData) => {
      return ! Predicate.or(predicates.map(Predicate.not))
    }

    // return (interactionData) => {
    //   for (let p of predicates) {
    //     if ( !p(interactionData) )
    //       return false
    //   }
    //   return true
    // }
  }

  // Creates a predicate whose truth value is the inverse of the constituent predicate
  static not(predicate) {
    return (interactionData) => {
      return !predicate(interactionData)
    }
  }
}

// yeah I refactored this at one point but now it's just gunna have to be merged
export default { handle, addHandler };


