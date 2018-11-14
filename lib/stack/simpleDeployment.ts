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

import { GitProject } from "@atomist/automation-client";
import { SdmGoalEvent } from "@atomist/sdm";

function pulumiYaml(name: string): { name: string, contents: string } {
    return {
        name: ".pulumi/Pulumi.yaml",
        contents: `name: ${name}
runtime: nodejs
`,
    };
}

function packageJson(name: string): { name: string, contents: string } {
    return {
        name: ".pulumi/package.json",
        contents: `{
    "name": "${name}",
    "devDependencies": {
        "@types/node": "latest"
    },
    "dependencies": {
        "@pulumi/pulumi": "latest",
        "@pulumi/kubernetes": "latest"
    }
}
`,
    };
}

function tsconfigJson(name: string): { name: string, contents: string } {
    return {
        name: ".pulumi/tsconfig.json",
        contents: `{
    "compilerOptions": {
        "outDir": "bin",
        "target": "es6",
        "lib": [
            "es6"
        ],
        "module": "commonjs",
        "moduleResolution": "node",
        "sourceMap": true,
        "experimentalDecorators": true,
        "pretty": true,
        "noFallthroughCasesInSwitch": true,
        "noImplicitAny": true,
        "noImplicitReturns": true,
        "forceConsistentCasingInFileNames": true,
        "strictNullChecks": true
    },
    "files": [
        "index.ts"
    ]
}
`,
    };
}

function indexTs(name: string, namespace: string, image: string): { name: string, contents: string } {
    return {
        name: ".pulumi/index.ts",
        contents: `import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const name = "${name}";

const deployment = new k8s.apps.v1.Deployment(name, {
    metadata: {
        name,
        namespace: "${namespace}"
    },
    spec: {
        selector: { matchLabels: { app: name } },
        replicas: 1,
        template: {
            metadata: { labels: { app: name } },
            spec: {
                containers: [
                    {
                        name,
                        image: "${image}",
                        resources: { requests: { cpu: "100m", memory: "320Mi" } },
                        ports: [{ containerPort: 8080, name: "http" }]
                    }
                ]
            }
        }
    }
});`,
    };
}

export function applySimpleDeployment(env: string): (project: GitProject, sdmGoal: SdmGoalEvent) => Promise<GitProject> {
    return async (p, g) => {
        await p.addFile(pulumiYaml(p.name).name, pulumiYaml(p.name).contents);
        await p.addFile(packageJson(p.name).name, packageJson(p.name).contents);
        await p.addFile(tsconfigJson(p.name).name, tsconfigJson(p.name).contents);
        await p.addFile(
            indexTs(p.name, env, g.push.after.image.imageName).name,
            indexTs(p.name, env, g.push.after.image.imageName).contents);
        return p;
    };
}
