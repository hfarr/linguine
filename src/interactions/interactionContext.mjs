import axios from 'axios';

const DISCORD_API_ENDPOINT = 'https://discord.com/api/v8'
const DEBUG = process.env.DEBUG === 'true'

const debugLog = (r) => { if (DEBUG); { console.log('API Response:\n', r); } }

export default class InteractionContext {

  static tokenMap = {}
  static idMap = {}

  constructor(initialInteraction) {
    // I'd prefer to use interaction id, but followup interactions from message components...
    // invalidate that
    this.initialInterID = initialInteraction.id
    this.interactionToken = initialInteraction.token

    // this.applicationID = initialInteraction.application_id
    this.interactionEndpoint = `${DISCORD_API_ENDPOINT}/webhooks/${initialInteraction.application_id}`

    // track message ids sent by this context, except for original which is reached with @original
    this.messages = []

    InteractionContext.tokenMap[this.interactionToken] = this
    InteractionContext.idMap[this.initialInterID] = this

  }

  editOriginal(msgData) {
    let url = `${this.interactionEndpoint}/${this.interactionToken}/messages/@original`
    axios.patch(url, msgData)
      .then(debugLog)
      .catch(console.error)
  }
  deleteOriginal() {
    let url = `${this.interactionEndpoint}/${this.interactionToken}/messages/@original`
    axios.delete(url)
      .then(debugLog)
      .catch(console.error)
  }
  sendNewMessage(msgContent) {
    let url = `${this.interactionEndpoint}/${this.interactionToken}`
    axios.post(url, msgContent)
      .then(debugLog)
      .catch(console.error)
      // TODO track follow up messages
      // .then(resp => { this.messages.push(resp.id) })
  }
  updateMessage(msgContent, msgID) {
    let url = `${this.interactionEndpoint}/${this.interactionToken}/messages/${msgID}`
    axios.patch(url, msgContent)
      .then(debugLog)
      .catch(console.error)
  }
  static fetchByToken(token) {
    return InteractionContext.tokenMap[token]
  }
  static fetchByID(id) {
    return InteractionContext.idMap[id]
  }
  cleanup() {
    delete InteractionContext[this.interactionToken]
  }
}
