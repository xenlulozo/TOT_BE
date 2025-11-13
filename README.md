<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Game Socket Module

- The `SocketModule` registers a Socket.IO gateway at `src/socket/socket.gateway.ts` for real-time gameplay events.
- Clients emit `joinRoom` with `{ roomId, data }` to join and sync state; updates (including host info) are broadcast via `roomUpdate`.
- Use `playerAction` to broadcast gameplay actions to all players in a room.
- Room metadata can be updated through `updateMeta`, and players leave rooms with `leaveRoom`.
- The first player to join a room becomes the host (`isHost: true` in the join response) and retains host privileges until they disconnect, at which point host control transfers automatically.
- TOT game flow lives in `src/game/tot/tot-game.core.ts` and exposes socket events:
  - Emit `tot:startGame` with `{ roomId }` to start a session using everyone currently joined; the host is excluded from the draw and at least one additional player is required, otherwise the start is rejected (`started: false` in the ack). When accepted, the first selection is emitted automatically after ~3 s via `tot:playerSelected`.
  - Emit `tot:chooseOption` with `{ roomId, type: 'truth' | 'trick' }` from the active player to lock in their choice; listen for `tot:turnOptionSelected` to receive the prompt payload.
  - Emit `tot:finishTurn` with `{ roomId }` once the active player completes their action; the gateway immediately emits `tot:spinning` (5 s duration) to signal the wheel animation, then schedules the next auto-selection after 5 s (if anyone remains) and broadcasts `tot:turnFinished` so clients can show a countdown. After the spin completes, `tot:playerSelected` is emitted with the next player.
  - Emit `tot:drawNext` with `{ roomId }` to force an immediate selection (skipping the delay); listen for `tot:playerSelected` or `tot:playerPoolExhausted` when everyone has played.
  - Emit `tot:controlGame` with `{ roomId, action: 'end' | 'restart' }` to either end the session (`tot:gameEnded`, sockets leave the room) or immediately restart with the current roster (`tot:gameRestarted`).
- Truth/Trick prompts are seeded in `src/game/tot/prompts.json`. They are sampled without repeats until the pool refreshes, and each entry follows `{ id, content, type }` to mirror the future database schema.
- Room participants carry a status enum (`pending`, `active`, `completed`) defined in `PlayerStatus` (`src/socket/socket.service.ts`). Status changes broadcast through the usual `roomUpdate` flow so the UI can highlight whose turn it is.