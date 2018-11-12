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
    spawnAndWatch,
    SuccessIsReturn0ErrorFinder,
} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    ExecuteGoal,
    FulfillableGoalDetails,
    getGoalDefinitionFrom,
    Goal,
    GoalWithFulfillment,
    StringCapturingProgressLog,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import * as path from "path";

export interface PulumiOptions {
    token: string;
    stack: string;

    // TODO cd add ability to throw in a stack
}

export class PulumiUp extends GoalWithFulfillment {

    constructor(public readonly options: PulumiOptions,
                public readonly details?: FulfillableGoalDetails,
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefinitionFrom(details, DefaultGoalNameGenerator.generateName("pulumi-up")),
            displayName: `pulumi up \`${options.stack}\``,
            workingDescription: `pulumi up \`${options.stack}\` running`,
            completedDescription: `pulumi up \`${options.stack}\` completed`,
            failedDescription: `pulumi up \`${options.stack}\` failed`,
            isolated: true,
        }, ...dependsOn);

        this.addFulfillment({
            name: `pulumi-up-${this.definition.uniqueName}`,
            goalExecutor: executePulumiUp(options),
        });
    }
}

function executePulumiUp(options: PulumiOptions): ExecuteGoal {
    return async gi => {
        const { credentials, id, goal, progressLog, configuration } = gi;
        return configuration.sdm.projectLoader.doWithProject({ credentials, id, readOnly: true }, async p => {

            if (!(await p.hasFile(".pulumi/Pulumi.yaml"))) {
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
                    cwd: path.join(p.baseDir, ".pulumi"),
                },
                progressLog,
                {
                    errorFinder: SuccessIsReturn0ErrorFinder,
                },
            );

            if (result && result.code !== 0) {
                return result;
            }

            progressLog.write(`Running 'pulumi up' for stack '${p.name}-${options.stack}'`);
            const log = new StringCapturingProgressLog();
            result = await spawnAndWatch({
                    command: "pulumi",
                    args: ["up", "--non-interactive", "--stack", `${p.name}-${options.stack}`],
                },
                {
                    cwd: path.join(p.baseDir, ".pulumi"),
                    env: {
                        ...process.env,
                        PULUMI_ACCESS_TOKEN: options.token,
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
