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
    GitProject,
    spawnAndWatch,
    SuccessIsReturn0ErrorFinder,
} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    ExecuteGoal,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    FulfillmentRegistration,
    getGoalDefinitionFrom,
    Goal,
    GoalEnvironment,
    IndependentOfEnvironment,
    LogSuppressor,
    ProductionEnvironment,
    ProgressTest,
    ReportProgress,
    SdmGoalEvent,
    StagingEnvironment,
    StringCapturingProgressLog,
    testProgressReporter,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import * as path from "path";

export interface PulumiUpRegistration extends FulfillmentRegistration {
    stack?: (goal: SdmGoalEvent) => string;
    transform?: (project: GitProject, sdmGoal: SdmGoalEvent) => Promise<GitProject>;
    token?: string;
}

const DefaultPulumiOptions: Partial<PulumiUpRegistration> = {
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
};

export class PulumiUp extends FulfillableGoalWithRegistrations<PulumiUpRegistration> {

    constructor(public readonly options?: FulfillableGoalDetails,
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefinitionFrom(options, DefaultGoalNameGenerator.generateName("pulumi-up")),
            displayName: `pulumi up${environmentFromDetails(options.environment)}`,
            workingDescription: `pulumi up${environmentFromDetails(options.environment)} running`,
            completedDescription: `pulumi up${environmentFromDetails(options.environment)} completed`,
            failedDescription: `pulumi up${environmentFromDetails(options.environment)} failed`,
            isolated: true,
        }, ...dependsOn);
    }

    public with(registration: PulumiUpRegistration): this {
        this.addFulfillment({
            name: registration.name,
            goalExecutor: executePulumiUp(registration),
            logInterpreter: LogSuppressor,
            progressReporter: PulumiProgressReporter,
            pushTest: registration.pushTest,
        });
        return this;
    }
}

function executePulumiUp(options: PulumiUpRegistration): ExecuteGoal {
    return async gi => {

        const { credentials, id, sdmGoal, goal, progressLog, configuration } = gi;
        const optsToUse: PulumiUpRegistration = {
            ...DefaultPulumiOptions,
            ...options,
        };

        return configuration.sdm.projectLoader.doWithProject({ credentials, id, readOnly: true }, async project => {

            if (optsToUse.transform) {
                progressLog.write(`Running code transform to add pulumi stack application`);
                await optsToUse.transform(project, sdmGoal);
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
            const token = optsToUse.token || configuration.sdm.pulumi.token;
            if (!token) {
                progressLog.write("No Pulumi access token in 'sdm.pulumi.token'");
                return {
                    code: 1,
                    message: "No Pulumi access token in 'sdm.pulumi.token'",
                };
            }

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
                        PULUMI_ACCESS_TOKEN: token,
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

function environmentFromDetails(environment: GoalEnvironment | string): string {
    switch (environment) {
        case IndependentOfEnvironment:
            return "";
        case StagingEnvironment:
            return " `testing`";
        case ProductionEnvironment:
            return " `production`";
        default:
            // We still have this oddity about env names starting with number-
            return ` \`${environment.split("-")[1]}\``;
    }
}
