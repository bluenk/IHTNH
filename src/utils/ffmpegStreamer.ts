import { spawn } from "child_process";
import { loggerInit } from "./logger.js";

const log = loggerInit('ffmpegStreamer');
const ffmpegPath = '/usr/bin/ffmpeg';

/**
 * Convert m3u8 url to stream.
 * @param url m3u8 url
 */

export default function ffmpegStreamer(url: string) {
    log('Start streaming data.');

    const ffmpeg = spawn(ffmpegPath, [
        '-i', url,
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        '-'
    ]);

    ffmpeg.stderr.on('error', console.error);

    ffmpeg.on('close', (code, singal) => {
        log(`Process exited, code: ${code}, singal: ${singal}.`);
    });

    // Kill any running ffmpeg process when bot shutting down
    process.on('exit', () => ffmpeg.kill());

    return ffmpeg.stdout
}
