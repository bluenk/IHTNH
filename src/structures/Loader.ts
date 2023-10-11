import glob from 'glob';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { Client } from './Client.js';
import { Command } from './Command.js';
const globPromise = promisify(glob);

export default abstract class Loader {
    /**
     * Import module files and return an instance.
     */
    public async importModules(path: string, client: Client) {
        const files = globPromise(join(dirname(fileURLToPath(import.meta.url)) + '/' + path) + '/*{.ts,.js}');
        return Promise.all((await files).map(async file => new ((await import(file)).default)(client)))
    }
}