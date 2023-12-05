import { spawn } from "child_process";
import { loggerInit } from "./logger.js";

const log = loggerInit('ffmpegStreamer');
const ffmpegPath = '/usr/bin/ffmpeg';

/**
 * Convert m3u8 url to stream.
 * @param url m3u8 url
 * @param mode select working mode
 */

export default function ffmpegStreamer(url: string, mode: 'STREAM_MP4' | 'GIF') {
    log('Start streaming data...');
    log('Streaming mode: ' + mode);

    const gifOptions = [
        '-i', url,
        '-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
        '-f', 'GIF',
        '-'
    ];
    const mp4Options = [
        '-i', url,
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        '-'
    ];

    const ffmpeg = spawn(ffmpegPath, mode === 'STREAM_MP4' ? mp4Options : gifOptions);

    ffmpeg.stderr.on('error', console.error);

    ffmpeg.on('close', (code, singal) => {
        log(`Process exited, code: ${code}, singal: ${singal}.`);
    });

    // Kill any running ffmpeg process when bot shutting down
    process.on('exit', () => ffmpeg.kill());

    return ffmpeg.stdout
}
