/**
 * Custom log funstion.
 */
export function log(text: any | Error, from?: string) {
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