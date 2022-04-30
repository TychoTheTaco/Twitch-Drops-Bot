import path from "node:path";
import {fileURLToPath} from "node:url";

import depcheck from "depcheck";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
depcheck(root, {}).then((unused) => {
    const dependencies = unused.dependencies;
    if (dependencies.length > 0) {
        console.error("You have the following unused dependencies in package.json: " + dependencies.join(", "));
        process.exit(1);
    }
}).catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});
