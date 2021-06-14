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
  UpdateMessage: 7,         // (component only) Immedaite response, updates original componentes message
}

function immediateResponse(content) {
  return { 
    type: InteractionCallbackTypes.ChannelMessageWithSource,
    content
  }
}

function immediateComponentResponse(content) {
  return {
    type: InteractionCallbackTypes.UpdateMessage,
    content
  }
}

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


// Hmm
// Should we go Ham in our API implementation? like discordjs? I think not
function InteractionResponse() {

}

function ComponentInteractionResponse() {

}

/**
 * Gateway for all interactions. Returns a promise that resolves when the given
 * request is handled - either by returning data for an "immediate response" type 4 interaction,
 * or without data as an acknowledgement for other interactions, potentially making a callback.
 * 
 * @param interactionData Interaction object from discord https://discord.com/developers/docs/interactions/slash-commands#interaction
 */
async function handle(interactionData) {

  let { id } = interactionData
  let interaction = getInteraction(id, interactionData)
  
  console.debug(interaction)

  // prototype for linguine

  let { type } = interaction
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

export default { handle };


