# Linguine :spaghetti:

### They're good for you

Dev note: This readme is outdated and is missing substantial information.
If anyone is interested in developing or deploying please contact me for help 
setting up your environment.

## Whomst?

This is a discord base linguine tracking system, custom built
for the Official Qitta Fan Club (OQFC). More information on
linguines can be found on the shared google drive for members.

Linguines are tracked by two counters per individual. 

- The "points" counter ranges from 0 to 100 (technically 99,
    as values over 100 become linguines and reduce the counter
    to below 100). 
    When the takes get too spicy and/or disrespectful, an 
    informal consensus of OQFC members can assign an agreed 
    upon number of points (typically in increments of 5). 
    These can be officially distributed on discord by typing

    ```
    !points <discord @ of person> <number of points>
    ```

    For example, `!points @fredo 15` assigns Henry 15 points.
    This counter resets daily at 4AM back to 0, and after
    reaching 100 (whichever comes first).

- The "linguines" counter increments for an individual when their
    points counters reaches or exceeds 100, indicating they've
    earned a linguine. This action also triggers an announcement
    in the designated channel.

    Only designated OQFC members can remove linguines. 
    Although right now that must be done by manually editing the database.

Each individual's counter can be referenced in discord. Enter in
`!points <person's @>` for their points, or `!linguines <person's @>`
for their linguines.

# Development/Deployment

Contact me if you would like help!

## Requirements

### **Important!**

Linguine uses the Discord interactions API, which *requires you to authenticate incoming interactions*. 
In development and production I intercept all interactions by a separate service and perform authentication there.
All PING interactions are handled by this service, the rest are proxied to Linguine.
As a consequence there is zero authentication code within Linguine itself, and zero code to handle PING interactions.
If you do not set up authentication **interactions will not work**. 
Talk to Henry for help. I can loop your dev app into my third party authentication service (I have it set up as the end point for any app I create that uses interactions).

The host machine that must have the following. 
- A unix-like system
    - Linguine binds to unix sockets to serve its web content. Unfortunately this feature is hardcoded right now- but is ripe for change if you'd like to contribute a fix!
    - To actually see the webpages you will need a front-facing webserver, AKA a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy). There are [additional instructions](#setting-up-a-webserver) to do this below.
- [git](https://git-scm.com)
- A [discord app](https://discord.com/developers/docs/intro) with a bot user.
- A [Docker](https://www.docker.com/) installation
- A [docker-compose](https://docs.docker.com/compose/install/) binary
    - Certain versions of docker (the latest ones) have `compose` built in. Check yours! The commands are all the same, but start with `docker compose` and not `docker-compose`.

Better deployment procedures are, presently, pleasant dreams we have for the future. 
I welcome recommendations.

### Recommended

If you want to run code on your host, or just have access to a JS repl. Not strictly necessary. Really handy if you want to develop though.

- [Node Version Manager](https://github.com/nvm-sh/nvm) (nvm)
- An installation of [node](https://nodejs.org) (which you can get if you have [nvm](https://github.com/nvm-sh/nvm) by running `nvm install` within the root of your copy of this repository)
- [npm](https://npmjs.com)

## Instructions (mac/linux) for running

Any commands to be run are assumed to be run in a compatible shell like bash. If you are on windows consider using [WSL2](https://docs.microsoft.com/en-us/windows/wsl/install-win10). 
A level of command line familiarity is assumed, at least until this procedure improves.

1. Clone this repository with `git clone https://github.com/hfarr/linguine.git`. If you have an ssh key set up with github you can use `git@github.com:hfarr/linguine.git` instead. The remaining instructions take place within the directory. To get in run `cd linguine`.

1. Create a file called `.env` in the root of your local copy of the repository, and populate it with the following contents:

    ```bash
    DISCORD_TOKEN=<discord bot token. KEEP THIS SECRET>
    CLIENT_ID=<discord developer application oauth2 client id>
    CLIENT_SECRET=<discord developer application oauth2 client secret>

    BOT_LINK=<URL to register the bot (discord API oauth)>
    REDIRECT_URI=<URL back to the website where the user clicked to register>
    BIND_PORT=<Internal port for the service to bind. I recommend 80>
    ```

    Replace the bracketed text on each line with corresponding values, as described. You can find this information on your [discord application](https://discord.com/developers/applications) page for this project.

1. Build the linguine server image `docker-compose build` (or `docker compose build` if your docker installation includes compose).

1. Pull the redis image `docker-compose pull redis`

1. Start linguine `docker-compose up -d`

Executing `docker-compose up -d` (or without the detached flag `docker-compose up`) will automatically build (if build context is specified) and pull (all other) images. This option is a convenience tool. For production images consider explicitly building, pulling, and even tagging images for each release. A project this small may not benefit from these extra steps. A larger project, or a thought-out ci/cd process, usually would.

### Setting up a webserver

An additional compose file (for use with docker compose) is included
in this repository. It specifies another container, running `nginx`,
which will act as a reverse-proxy and can forward IP connections to
the unix socket that linguine binds to.

To use, first stop linguine if it is running `docker-compose down`.
Then copy `docker-compose.proxy.yml` into `docker-compose.override.yml`.
```bash
cp docker-compose.proxy.yml docker-compose.override.yml
```
You do not need to change anything else. Compose will automatically combine
these two files into one configuration (you can see the configuration it
will use by running `docker-compose config`).

Bring linguine and the proxy up as you would bring linguine up without the proxy.
```bash
docker-compose up -d
```

Visit `localhost` in your browser.

To revert, stop linguine then delete `docker-compose.override.yml`.
```bash
docker-compose down
rm docker-compose.override.yml
```

**Note:**
To use Ouath2 redirects with your local webserver you must
* bind the server to an external interface (so that computers over the internet can connect)
* forward port 443
* point a domain you control to your computer
* add a redirect URL on an associated discord app using the same domain
* obtain a TLS certificate for your domain
* update the proxy to validate the certificate and serve on 443

**This is not necessary to obtain a token for your bot, or even to do code/token exchange.**

Those steps are necessary to execute on the host machine that runs the app
in production. For development it is not necessary, but it becomes difficult to
test any oauth integration. My recommendation if you need an Oauth2 token is
set up `https://example.com` as your redirect domain, then when you authorize
on your app copy the 'code' value from the query string and perform a token
exchange manually. (Disclaimer, I haven't tested this, but theoretically any https:// domain 
should work but pick one you trust that doesn't already implement a discord bot.)

<!-- hoping an empty # will create an h1 tag that github has styled to use a border lol -->
<!-- looks like it does in VSCode preview at least -->
#

## Ideas

- **!important** refresh tokens regularly! like. schedule it! biweekly! or whenever the thingies expire!!
    - or some setting for this

- Track "unresolved" linguines separately"
    - Document their resolution (date, activity)
    - Weekly reminders for outstanding linguines

- Automatic birthday linguines

- Web panel
    - Overview of linguine state
    - Authenticate w/discord
    - administrative actions
    - linguine removal (designated members only)
    - Potential actions, like cap maximum points someone can give...
        - ... in a single command
        - ... per day

        as anyone can assign, e.g, 1000000000 points. Or get into an overflow state. Yeah. We don't check for that!
        but I think `parseInt(...)` will fail in a way we are handling (NaN, infinite, or something) so it might 
        not be an issue - but the abuse potential is.

- Log all commands
    - per guild, user
    - Audit trail that admins can see on the web panel
    - Command log can be viewed in discord
    - Logs each method? separate debug log? save off to file?
    - Dupe all state-changes to webhook channel (as a Ledger of Record) if commands causing the change were issued in other channels

- Refactor
    - There is a lot (a **lot**) of room to reaaaallly make use of type script, modules, 
        PROPER class semantics, all the nice ES6 features.
    - An easy reach is separating concerns to different files, write now the entire app
        runs in a monofile, but 
        - Databse access
        - Webserver resources
        - Discord server and client management
    
        should get their own directories/files under `src/` to separate concerns.

- Track keys better
    
    basically, we need to use [sets](https://redis.io/commands#set) and store more data lol
    - Reference recovery
        - Right now, "user data" keys in redis that reference a users linguines or their points
            are not tracked explicitly in the data base
        - They are generated on demand
        - "user points" keys expire and present less of a problem, but "user linguines" are permanent
        - The only way to recover them is iterate over all keys in redis
        - Should store a means to access keys, if you have a reference to the guild id.
            This could be simple as `users:<guildId> = [<userId>, <userId>, <userId>, ... ]`, then can
            rebuild the reference w/userId, or store the full key to all bits of data. Probably first
            way is better. And probably as a nother set, not list.
    - Sets not lists
        - The guilds linguine is registered on is tracked in a redis list
        - lists works for this use case as straight storage, but are inefficient for most of the ops we want
            (e.g membership w/in the list, remove) - you can kinda use `LPOS`, `LRANGE` (over the
            whole list), `LREM` (? maybe) but a set represents the data much better.

- Decouple webserver binding
    - Parameterize bind options
    - Remove FS management code specifically written for unix socket management

    Linguine binds to a unix socket but this makes it far less portable.
    I wanted to experiement with unix sockets as a solution to cross-container
        IPC (without docker networks) but that does not need to be hard coded.

- Test suite
- Better production and dev deployment procedure
    - Minimize those requirements dagnabbit
- CI/CD
    - Automated builds
    - Automated testing
    - Automated deploy
    
    I've been using a script to push updates and restart server but wowee that does not inspire confidence

- Security
    - Add state parameter to the oauth2 authorization workflow (need to do some learning for this)

<br>

## Nitty Grittles

### How does it work?



**FAQ**

- Why [Node.js](https://nodejs.org)?

    Henry is trying to learn javascript and has only really experienced backend work in Python, Ruby, and Java. 
    One of my goals for the summer of 2021 before I start work is to finish off projects and this was a good chance to stretch out muscles I've never used before. 
    I am also finding out that I quite like node for application level programming, over python/java/ruby (and, lets not kid ourselves, web app dev in ruby is more or less exclusively on the rails framework). 
    Python I like for batch processes, number cronch, small programs, but there are a few pieces of it that are not as pleasant to use. 
    Off the top of my head it's package management, import system, precarious conventions (e.g define `__str__` to make `str(...)` applicable to that object), and maybe a few other things have made for enough friction to stop me from trying to do larger-scoped projects with it. 
    But I love using it to solve e.g coding challenges. 
    I can make similar complaints about java, ruby but I should probably save that for a blog post haha.

    Also I really like the async support and hyper active development! Javascript is, I think, picked on a lot by devs who primarily work in other languages (this was me). Cay S. Horstmann's _[Modern Javascript for the Impatient](https://horstmann.com/javascript-impatient/)_ has given me an appreciation for JS. That book was my primary resource aside from API references for each library.


