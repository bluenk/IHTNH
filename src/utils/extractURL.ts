/**
 * Extract URLs from string.
 */
export default function extractURL(text: string): string[] {
    const urlMatch = text.match(/(https?:\/\/[^ ]*)/g);
    if (!urlMatch) return [];

    const urls = urlMatch.flatMap(str => {
        if (str.includes('\n')) {
            const removeNewline = str.split('\n');
            return removeNewline.filter(u => u.match(/(https?:\/\/[^ ]*)/));
        } else {
            return str;
        }
    });

    return urls;
}