/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    NoParameters,
    spawnAndWatch,
    SuccessIsReturn0ErrorFinder,
} from "@atomist/automation-client";
import {
    CodeTransform,
    DefaultGoalNameGenerator,
    ExecuteGoal,
    FulfillableGoalDetails,
    getGoalDefinitionFrom,
    Goal,
    GoalWithFulfillment,
    IndependentOfEnvironment,
    LogSuppressor,
    ProductionEnvironment,
    ProgressTest,
    PushAwareParametersInvocation,
    PushListenerInvocation,
    PushTest,
    ReportProgress,
    SdmGoalEvent,
    StagingEnvironment,
    StringCapturingProgressLog,
    testProgressReporter,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import * as path from "path";

export interface PulumiOptions {
    token: string;
    stack?: (goal: SdmGoalEvent) => string;
    transforms?: Array<{ transform: CodeTransform<NoParameters>, pushTest?: PushTest }>;
}

const DefaultPulumiOptions: Partial<PulumiOptions> = {
    stack: g => {
        switch (g.environment) {
            case IndependentOfEnvironment:
                return g.repo.name;
            case StagingEnvironment:
                return `${g.repo.name}-testing`;
            case ProductionEnvironment:
                return `${g.repo.name}-production`;
            default:
                // We still have this oddity about env names starting with number-
                return `${g.repo.name}-${g.environment.split("-")[1]}`;
        }
    },
    transforms: [],
};

export class PulumiUp extends GoalWithFulfillment {

    constructor(public readonly options?: FulfillableGoalDetails & PulumiOptions,
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefinitionFrom(options, DefaultGoalNameGenerator.generateName("pulumi-up")),
            displayName: `pulumi up \`${options.stack}\``,
            workingDescription: `pulumi up \`${options.stack}\` running`,
            completedDescription: `pulumi up \`${options.stack}\` completed`,
            failedDescription: `pulumi up \`${options.stack}\` failed`,
            isolated: true,
        }, ...dependsOn);

        this.addFulfillment({
            name: `pulumi-up-${this.definition.uniqueName}`,
            goalExecutor: executePulumiUp(options),
            logInterpreter: LogSuppressor,
            progressReporter: PulumiProgressReporter,
        });
    }
}

function executePulumiUp(options: PulumiOptions): ExecuteGoal {
    return async gi => {

        const { credentials, id, sdmGoal, goal, progressLog, configuration, context, addressChannels } = gi;
        const optsToUse: PulumiOptions = {
            ...DefaultPulumiOptions,
            ...options,
        };

        return configuration.sdm.projectLoader.doWithProject({ credentials, id, readOnly: true }, async project => {

            if (optsToUse.transforms && optsToUse.transforms.length > 0) {
                const pli: PushListenerInvocation = {
                    context,
                    addressChannels,
                    credentials,
                    project,
                    id,
                    push: sdmGoal.push,
                };

                const papi: PushAwareParametersInvocation<NoParameters> = {
                    credentials,
                    addressChannels,
                    context,
                    parameters: [],
                    push: {
                        context,
                        addressChannels,
                        credentials,
                        push: sdmGoal.push,
                        id,
                        project,
                        filesChanged: [],
                        commit: undefined,
                        impactedSubProject: undefined,
                    },
                };

                for (const transform of optsToUse.transforms) {
                    if (!transform.pushTest || (await transform.pushTest.mapping(pli))) {
                        await transform.transform(project, papi);
                    }
                }
            }

            if (!(await project.hasFile(".pulumi/Pulumi.yaml"))) {
                progressLog.write("No pulumi application found in project");
                return {
                    code: 1,
                    description: `${goal.failureDescription} (no application found)`,
                };
            } else {
                progressLog.write(`Project has pulumi application in '.pulumi' directory`);
            }

            progressLog.write(`Running 'npm install'`);
            let result = await spawnAndWatch({
                    command: "npm",
                    args: ["install"],
                },
                {
                    cwd: path.join(project.baseDir, ".pulumi"),
                },
                progressLog,
                {
                    errorFinder: SuccessIsReturn0ErrorFinder,
                },
            );

            if (result && result.code !== 0) {
                return result;
            }

            const stack = optsToUse.stack(sdmGoal);

            progressLog.write(`Running 'pulumi up' for stack '${stack}'`);
            const log = new StringCapturingProgressLog();
            result = await spawnAndWatch({
                    command: "pulumi",
                    args: ["up", "--non-interactive", "--stack", `${stack}`],
                },
                {
                    cwd: path.join(project.baseDir, ".pulumi"),
                    env: {
                        ...process.env,
                        PULUMI_ACCESS_TOKEN: optsToUse.token,
                    },
                },
                new WriteToAllProgressLog("pulumi up", log, progressLog),
                {
                    errorFinder: SuccessIsReturn0ErrorFinder,
                },
            );

            if (result && result.code !== 0) {
                return result;
            }

            const url = /Permalink: (.*)/i.exec(log.log)[1];
            return {
                ...result,
                externalUrls: [{
                    label: "Permalink",
                    url,
                }],
            };
        });
    };
}

export const PulumiProgressTests: ProgressTest[] = [{
    test: /Invoking goal hook: pre/i,
    phase: "pre-hook",
}, {
    test: /Invoking goal hook: post/i,
    phase: "post-hook",
}];

export const PulumiProgressReporter: ReportProgress = testProgressReporter(...PulumiProgressTests);
