import axios from 'axios';

class StateMachine {

}

let idCtr = 0

let discordAPIEndpoint = 'https://discord.com/api/v8'

// temp
let appID = '857817444251729940'

// let discordA
// function editResponse(token) {
// }

// ..invalidate after 10 min.. (discord limit 15)
// ..save interaction tokens..
// ..not every interaction is super stateful..
export default class InteractionContext extends StateMachine {

  constructor(initialInteraction, customID = undefined) {
    super()
    // I'd prefer to use interaction id, but followup interactions from message components...
    // invalidate that
    this.uid = idCtr++
    this.initialInterID = initialInteraction.id
    this.interactionToken = initialInteraction.token

    // track message ids sent by this context, except for original which is reached with @original
    this.messages = []

    console.log(`Created context: id ${this.uid}, token: ${this.interactionToken}`)

    // Every interaction consumed by this context
    this.interactionHistory = [ initialInteraction ]
  }

  // Do something with the interaction
  consume(interaction) {
    console.log('Unimplemented')
  }

  // todo - by default it should return false. For sure an interaction context always handles its 
  //  initial interaction.
  shouldHandle(interaction) {
    if ( this.initialInterID === interaction.id ) {
      return true
    }
    return false
  }

  // a context decides if it should handle an interaction or not
  handle(interaction) {
    if ( this.shouldHandle(interaction) )
      return Promise.resolve(this.consume(interaction))

    return Promise.reject()
  }

  editOriginal(msgContent) {
    let url = `${discordAPIEndpoint}/webhooks/${appID}/${this.interactionToken}/messages/@original`
    axios.patch(url, msgContent)
      // .then(console.log)
      .catch(console.error)
  }
  deleteOriginal() {
    let url = `${discordAPIEndpoint}/webhooks/${appID}/${this.interactionToken}/messages/@original`
    axios.delete(url)
      // .then(console.log)
      .catch(console.error)
  }
  sendNewMessage(msgContent) {
    let url = `${discordAPIEndpoint}/webhooks/${appID}/${this.interactionToken}`
    axios.post(url, msgContent)
      // .then(console.log)
      .catch(console.error)
      // .then(resp => { this.messages.push(resp.id) })
  }
  updateMessage(msgContent, msgID) {
    let url = `${discordAPIEndpoint}/webhooks/${appID}/${this.interactionToken}/messages/${msgID}`
    axios.patch(url, msgContent)
      // .then(console.log)
      .catch(console.error)
  }
}
