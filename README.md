<p align="center">
  <img src="https://images.atomist.com/sdm/SDM-Logo-Dark.png">
</p>

# @atomist/sdm-pack-pulumi

[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist/sdm-pack-pulumi/f5958b6e-b785-40c7-839d-52fb87c75351)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-pulumi.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-pulumi)

An extension pack for an [Atomist][atomist] software delivery machine (SDM) to
integrate with [Pulumi][pulumi] to automate creation and management of cloud infrastructure.

Software delivery machines enable you to control your delivery process
in code.  Think of it as an API for your software delivery.  See the
[Atomist documentation][atomist-doc] for more information on the
concept of a software delivery machine and how to create and develop
an SDM.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)
[pulumi]: https://pulumi.com (Pulumi)

## Getting started

Schedule the `PulumiUp` as show in the following snipped:

```typescript
const deployment = new PulumiUp({
        environment: StagingEnvironment,
    });
    
    deployment.with({
        name: "staging-deployment",
        token: sdm.configuration.sdm.pulumi.token,
        stack: goal => `${goal.repo.name}-testing`,
        transform: applySimpleDeployment("testing"),
    });
```

## Contributing

Contributions to this project from community members are encouraged
and appreciated. Please review the [Contributing
Guidelines](CONTRIBUTING.md) for more information. Also see the
[Development](#development) section in this document.

## Code of conduct

This project is governed by the [Code of
Conduct](CODE_OF_CONDUCT.md). You are expected to act in accordance
with this code by participating. Please report any unacceptable
behavior to code-of-conduct@atomist.com.

## Documentation

Please see [docs.atomist.com][atomist-doc] for
[developer][atomist-doc-sdm] documentation.

[atomist-doc-sdm]: https://docs.atomist.com/developer/sdm/ (Atomist Documentation - SDM Developer)

## Connect

Follow [@atomist][atomist-twitter] and [The Composition][atomist-blog]
blog related to SDM.

[atomist-twitter]: https://twitter.com/atomist (Atomist on Twitter)
[atomist-blog]: https://the-composition.com/ (The Composition - The Official Atomist Blog)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist-seeds/sdm-pack/issues

## Development

You will need to install [Node.js][node] to build and test this
project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
