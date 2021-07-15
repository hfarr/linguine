import InteractionContext from '../interactions/interactionContext.mjs'
import Interactor from '../interaction.mjs'

// TODO I need to test thoroughly.
// TODO this seems like a good candidate for async.
//    though I am still concerned about race conditions.
//    I can, for now, mitigate that risk, and/or learn later how to handle synchronized data (like the witness list)

const PERM_ADMINISTRATOR = 1 << 3

export class LinguineMember {

  constructor(discordMember, discordUser) {
    // could do destructuring in the ^ constructor parameters but I think that might make it a little less clear.
    this.name = discordMember.nick ?? discordUser.username
    this.id = discordUser.id
    this.permissions = discordMember.permissions ?? 0
  }

  // override eq? .. nah? don't feel like it? :I
  hasPermission(permission) {
    return (this.permissions & permission) === permission
  }

  // Key by which we map to this LinguineMember
  get key() {
    // Gives me a one-stop-spot for updating the key
    return this.id
  }

  get isAdmin() {
    return this.hasPermission(PERM_ADMINISTRATOR)
  }
}

// TODO if a trial is ongoing when the app restarts, then the message becomes permanent. 
//    If a message is interacted with and the token is not currently tracked, we should delete that message if possible.
//    We can do this cleanup on shutdown, which works if we always shutdown gracefully, as a backup we may wish to track in a database.

// Manages a linguine redemption.
export class LinguineRedeemer extends InteractionContext {

  // can key by interactionToken, which InteractionContext sets on `this`.
  // but, that implies multiple redemption courts w/in even one guild, but that is less important to me.
  static trialsInProgress = {}

  /**
   * Create a new LinguineRedeemer to track the progress of a redemption.
   * @param interactionData Initializing interaction (use of /linguines redeem ...)
   * @param redeemee LinguineMember representing the user to be redeemed
   * @param initiator LinguineMember representing the user who initiated redemption
   */
  constructor(interactionData, redeemee, initiator) {
    super(interactionData)

    // FOR NOW key by redeemee, even though that encodes "global" linguine redemption
    // or like create a GuildRedeemer object that can be used to create LinguineRedeemers, IDRC right now.
    LinguineRedeemer.trialsInProgress[redeemee.key] = this

    this.redeemee = redeemee
    this.initiator = initiator

    this.finished = false

    this.witnesses = []

    // start the expiration timer
    // 10 * 60 * 1000 = 10 minutes expressed in milliseconds
    // arrow function captures the meaning of 'this' correctly (in a closure?), for our use case
    this.timeout = setTimeout(() => { this.cleanup() }, 10 * 60 * 1000)

  }

  /**
   * Fetch the ongoing trial for a user
   * @param linguineMember A LinguineMember whose ongoing trial we'd like to return
   * @returns A LinguineRedeemer
   */
  static trialFor(linguineMember) {
    return LinguineRedeemer.trialsInProgress[linguineMember.key]
  }

  static trialExistsFor(linguineMember) {
    return (linguineMember.key in LinguineRedeemer.trialsInProgress)
  }

  /**
   * Sign off as a witness
   * @param witness LinguineMember who signed
   * @returns An object containing the success outcome, and a reason if signing failed.
   */
  witnessSignoff(witness) {
    let outcome = {
      success: true,
      reason: undefined
    }
    if (witness.id !== this.redeemee.id) { // the redeemee cannot witness their own redemption
      for (let w of this.witnesses) { // like, it would probably be more efficient to use an object, and check for key in object. It's a set after all, we guarantee uniqueness
        if (w.id === witness.id) {
          outcome.success = false
          outcome.reason = "You are already a witness!"
          break;
        }
      }
    } else {
      outcome.success = false
      outcome.reason = "You cannot act as a witness for your own redemption!"
    }

    if (outcome.success) {
      this.witnesses.push(witness)
    }
    return outcome
  }

  get messageData() {

    let csvWitnesses = this.witnesses.map(lm => lm.name).join(', ')
    let witnessField = {
      name: "Witnesses",
      value: this.witnesses.length > 0 ? csvWitnesses : '*None*'
    }

    let signoffMessageEmbeds = [
      {
        title: `Linguine Court`,
        description: `Call for witnesses to testify on behalf of ${this.redeemee.name} for redemptive purposes. At least two witnesses are required. At least one witness must have administrative power. At least one witnesses must not have administrative power.`,
        color: 0x99CC99,
        fields: [
          {
            name: "Individual to be redeemed",
            value: this.redeemee.name,
            inline: true,
          },
          {
            name: "Redemption initiator",
            value: this.initiator.name,
            inline: true,
          },
          witnessField,
        ]
      }
    ]

    let signoffMessageComponents = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "Sign your name as witness",
            custom_id: "redemption_witness_signoff",
          },
          {
            type: 2,
            style: 3,
            label: "Finish",
            custom_id: "redemption_finish",
            disabled: !this.criteriaMet, // TODO get this state from the redeemer
          },
          {
            type: 2,
            style: 4,
            label: "Cancel",
            custom_id: "redemption_cancel",
          }
        ]
      }
    ]

    return {
      embeds: signoffMessageEmbeds,
      components: signoffMessageComponents
    }
  }

  get updateResponse() {
    // let csvWitnesses = this.witnesses.map(lm => lm.name).join(', ')
    // let witnessField = {
    //   name: "Witnesses",
    //   value: this.witnesses.length > 0 ? csvWitnesses : '*None*'
    // }

    return Interactor.immediateComponentResponse(this.messageData)
  }

  // an InteractionResponse
  get response() {

    return Interactor.immediateResponse(this.messageData)
  }

  // Criteria is met if there is at least one admin witness and one non-admin witness, then return true, else false.
  get criteriaMet() {

    if (process.env.DEV_EXPEDITE_REDEMPTION === true) {
      return true
    }

    // we could also just track whenever an admin signs off, and whenever a non-admin signs off... rather than.. compute each time... TODO
    // would be nice to have an 'any' utility function, because this is a common pattern.
    let hasAdminWitness = this.witnesses.reduce((base, current) => base || current.isAdmin, false)
    let hasNonAdminWitness = this.witnesses.reduce((base, current) => base || (!current.isAdmin), false)
    console.debug(this.witnesses, hasAdminWitness, hasNonAdminWitness)
    return hasAdminWitness && hasNonAdminWitness
  }

  get isFinished() {
    return this.finished
  }

  /**
   * 
   * @returns True if this is the first time finish() is called, and thie redeemeer meets finishing criteria
   */
  finish() {
    if (!this.finished && this.criteriaMet) {
      this.finished = true
      return true
    }
    return false
  }

  static cancelAll() {
    for (let key in LinguineRedeemer.trialsInProgress) {
      LinguineRedeemer.trialsInProgress[key].cleanup()
    }
  }

  /**
   * Clean up trial when it ends
   *  - deletes original message
   *  - removes trial from trials in progress
   */
  cleanup() {
    super.deleteOriginal()
    delete LinguineRedeemer.trialsInProgress[this.redeemee.id]
    clearInterval(this.timeout)
    super.cleanup()
  }

}