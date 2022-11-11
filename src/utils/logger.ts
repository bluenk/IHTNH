/**
 * Custom log funstion.
 */
export function log(text: string | unknown | Error, from?: string) {
    const time = Date.now();

    if (from) {
        from = `(${from}) `;
    } else {
        from = '';
    }

    console[text instanceof Error ? 'error' : 'info'](
        new Date(time).toLocaleString('zh-TW', { hour12: false }) +
        ' [client]: ' + from + text
    );

}

/**
 * Create a logger with "from" arg already fill in.
 */
export function loggerInit(moduleName: string) {
    return (text: string | unknown | Error) => {
        log(text, moduleName);
    }
}