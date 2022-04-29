import glob from 'glob';
import { join } from 'path';
import { promisify } from 'util';
import { Client } from './Client';
import { Command } from './Command';
const globPromise = promisify(glob);

export default abstract class Loader {
    /**
     * Import module files and return an instance.
     */
    public async importModules(path: string, client: Client) {
        const files = globPromise(join(__dirname + '/' + path) + '/*{.ts,.js}');
        return Promise.all((await files).map(async file => new ((await import(file)).default)(client)))
    }
}