import requests

# Interaction - faked data
initiate_payload = { # INTERACTION
      "type": 2,
      "token": "numericUniqueInteractionToken", # a snowflake, or something. Its a string.
      "member": {
          "user": { # initiator
              "id": 53908232506183680,
              "username": "TestInitiator",
              "avatar": "a_d5efa99b3eeaa7dd43acca82f5692432",
              "discriminator": "1337",
              "public_flags": 131141
          },
          "roles": ["roleSnowflake"],
          "premium_since": None,
          "permissions": "2147483647",
          "pending": False,
          "nick": None,
          "mute": False,
          "joined_at": "2017-03-13T19:19:14.040000+00:00",
          "is_pending": False,
          "deaf": False
      },
      "id": "interactionIDRedeemInitiate",  # a unique id for this interaction, numberic string
      "guild_id": "290926798626357999",     # guild snowflake
      "data": { # APPLICATION COMMAND INTERACTION DATA
          "name": "linguines",
          "id": "ID-linguines",
          "options": [{
              "name": "linguines-redeem",
              "type": 1,  # subcommand
              "options": [
                {
                  "name": "redeemee",
                  "type": 6, # discord user
                  "value": "ID-redemee" # TODO a snowflake? or maybe we grab that (or a user object) from "resolved?" property
                }
              ]
          }],
      },
      "channel_id": "645027906669510667"
  }

url_local = "http://localhost:8000/interaction/"

def postit(url, payload):
  r = requests.post(url, json=payload)
  print(f'--------------------\n{r.json()}')

def test_initiate():
  postit(url_local, initiate_payload)

