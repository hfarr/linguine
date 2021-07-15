import axios from 'axios';

// temp
let appID = '857817444251729940'
let discordAPIEndpoint = 'https://discord.com/api/v8'
let discordAPIPostInteractionEndpoint = `${discordAPIEndpoint}/webhooks/${appID}`

export default class InteractionContext {

  constructor(initialInteraction) {
    // I'd prefer to use interaction id, but followup interactions from message components...
    // invalidate that
    this.initialInterID = initialInteraction.id
    this.interactionToken = initialInteraction.token

    // track message ids sent by this context, except for original which is reached with @original
    this.messages = []

  }

  editOriginal(msgContent) {
    let url = `${discordAPIPostInteractionEndpoint}/${this.interactionToken}/messages/@original`
    axios.patch(url, msgContent)
      // .then(console.log)
      .catch(console.error)
  }
  deleteOriginal() {
    let url = `${discordAPIPostInteractionEndpoint}/${this.interactionToken}/messages/@original`
    axios.delete(url)
      // .then(console.log)
      .catch(console.error)
  }
  sendNewMessage(msgContent) {
    let url = `${discordAPIPostInteractionEndpoint}/${this.interactionToken}`
    axios.post(url, msgContent)
      // .then(console.log)
      .catch(console.error)
      // .then(resp => { this.messages.push(resp.id) })
  }
  updateMessage(msgContent, msgID) {
    let url = `${discordAPIPostInteractionEndpoint}/${this.interactionToken}/messages/${msgID}`
    axios.patch(url, msgContent)
      // .then(console.log)
      .catch(console.error)
  }
}
