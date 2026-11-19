#!/usr/bin/env python3
"""Generate or check the original Rhythm Reactor metronome (Python 3 + FFmpeg).

Run from any directory: python3 apps/mobile/scripts/rhythm-reactor-metronome.py
Add --check to validate the checked-in compressed asset without rewriting it.
The retained WAV is an excerpt of an ElevenLabs-generated click; this script
arranges it on the beat grid and encodes the final mobile asset.
"""

import array
import json
import math
import pathlib
import subprocess
import sys
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSET = ROOT / 'assets/audio/rhythm-reactor-metronome.m4a'
MANIFEST = ASSET.with_suffix('.json')
SOURCE = pathlib.Path(__file__).with_name('rhythm-reactor-click.wav')
RATE = 48000
DURATION = 60
STEP = RATE // 2


def generate():
    samples = array.array('h', [0]) * (RATE * DURATION)
    with wave.open(str(SOURCE), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != RATE:
            raise ValueError('Source must be 48 kHz mono 16-bit PCM')
        click = array.array('h')
        click.frombytes(source.readframes(int(RATE * 0.06)))
    if sys.byteorder != 'little':
        click.byteswap()
    for beat in range(120):
        # The count-in is quieter and the first scoring beat is accented.
        gain = 0.55 if beat < 4 else (0.75 if beat % 4 == 0 else 0.65)
        for i, value in enumerate(click):
            attack = min(i / (RATE * 0.0005), 1)
            release = min((len(click) - 1 - i) / (RATE * 0.01), 1)
            samples[beat * STEP + i] = int(value * gain * attack * release)
    if sys.byteorder != 'little':
        samples.byteswap()
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / 'source.wav'
        with wave.open(str(wav), 'wb') as output:
            output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            output.writeframes(samples.tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '32k', '-movflags', '+faststart', str(ASSET)], check=True)


def check():
    manifest = json.loads(MANIFEST.read_text())
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(ASSET)]))
    streams = probe['streams']
    assert len(streams) == 1 and streams[0]['codec_name'] == 'aac'
    assert streams[0]['profile'] == 'LC' and streams[0]['channels'] == 1
    assert int(streams[0]['sample_rate']) == RATE
    assert abs(float(probe['format']['duration']) - DURATION) <= 0.025
    assert manifest['durationSeconds'] == DURATION and manifest['beatStepSeconds'] == 0.5
    assert manifest['firstHitTimeSeconds'] == 2 and manifest['countInBeats'] == 4
    assert manifest['file'] == ASSET.name and manifest['sizeBytes'] == ASSET.stat().st_size
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(ASSET), '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])
    samples = array.array('f')
    samples.frombytes(raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    assert abs(len(samples) / RATE - DURATION) <= 0.025
    peak = max(map(abs, samples))
    assert peak < 1, f'Clipping: peak {peak}'
    offsets = []
    for beat in range(120):
        start = beat * STEP
        # Peak within 10 ms of the grid, including the first scoring beat.
        window = samples[start:start + int(RATE * 0.01)]
        index = max(range(len(window)), key=lambda i: abs(window[i]))
        assert abs(window[index]) > 0.1, f'Missing beat {beat} at {beat / 2}s'
        offsets.append(index / RATE)
        # No extra transients between beats, leaving room for the click decay.
        gap = samples[start + int(RATE * 0.08):start + STEP - int(RATE * 0.02)]
        assert max(map(abs, gap), default=0) < 0.02, f'Unexpected transient after beat {beat}'
    print(f'OK: 120 beats, 0.0–59.5 s; first scoring beat 2.0 s; peak offsets {min(offsets)*1000:.2f}–{max(offsets)*1000:.2f} ms; peak {20*math.log10(peak):.2f} dBFS; {ASSET.stat().st_size} bytes')


if __name__ == '__main__':
    if sys.argv[1:] == []:
        generate()
    elif sys.argv[1:] != ['--check']:
        raise SystemExit('Usage: rhythm-reactor-metronome.py [--check]')
    check()
