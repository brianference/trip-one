#!/usr/bin/env python3
"""
Pre-generate high-quality pronunciation audio for the phrasebook using Microsoft
Edge's neural text-to-speech (the same approach as the tokyo-one site) — far
better than the browser's built-in SpeechSynthesis, especially for non-Latin
scripts. One MP3 per phrase per language, written to public/audio/<lang>/<i>.mp3,
where <i> is the phrase's index (phrases share the same order across languages).

Usage:  py -3.13 scripts/generate-phrase-audio.py   (needs `pip install edge-tts`)
Idempotent: existing files are skipped, so re-runs only fill gaps.
"""
import asyncio
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
PHRASEBOOK = ROOT / "src" / "features" / "localinfo" / "phrasebook.ts"
OUT = ROOT / "public" / "audio"

# Phrasebook language key -> an Edge neural voice for that language.
VOICES = {
    "french": "fr-FR-DeniseNeural",
    "german": "de-DE-KatjaNeural",
    "spanish": "es-ES-ElviraNeural",
    "italian": "it-IT-ElsaNeural",
    "portuguese": "pt-BR-FranciscaNeural",
    "japanese": "ja-JP-NanamiNeural",
    "mandarin": "zh-CN-XiaoxiaoNeural",
    "korean": "ko-KR-SunHiNeural",
    "thai": "th-TH-PremwadeeNeural",
    "vietnamese": "vi-VN-HoaiMyNeural",
    "indonesian": "id-ID-GadisNeural",
    "malay": "ms-MY-YasminNeural",
    "dutch": "nl-NL-ColetteNeural",
    "greek": "el-GR-AthinaNeural",
    "russian": "ru-RU-SvetlanaNeural",
    "ukrainian": "uk-UA-PolinaNeural",
    "polish": "pl-PL-ZofiaNeural",
    "turkish": "tr-TR-EmelNeural",
    "arabic": "ar-SA-ZariyahNeural",
    "hebrew": "he-IL-HilaNeural",
    "hindi": "hi-IN-SwaraNeural",
    "sinhala": "si-LK-ThiliniNeural",
    "nepali": "ne-NP-HemkalaNeural",
    "icelandic": "is-IS-GudrunNeural",
    "norwegian": "nb-NO-PernilleNeural",
    "swedish": "sv-SE-SofieNeural",
    "danish": "da-DK-ChristelNeural",
    "finnish": "fi-FI-NooraNeural",
    "czech": "cs-CZ-VlastaNeural",
    "hungarian": "hu-HU-NoemiNeural",
    "romanian": "ro-RO-AlinaNeural",
    "croatian": "hr-HR-GabrijelaNeural",
}


def native_text(translation: str) -> str:
    """Native script only: drop the "(romanization)" and soften slashes — the
    exact transform the client uses in speech.ts's spokenText()."""
    t = re.sub(r"\s*\([^)]*\)\s*$", "", translation)
    t = re.sub(r"\s*/\s*", ", ", t)
    return t.strip()


def parse_phrasebook() -> dict[str, list[str]]:
    """Extract, per language and in order, the list of translation strings."""
    text = PHRASEBOOK.read_text(encoding="utf-8")
    # Isolate the object literal body.
    start = text.index("PHRASES_BY_LANGUAGE")
    body = text[start:]
    result: dict[str, list[str]] = {}
    # Each language block: `key: [ ... ],`
    for block in re.finditer(r"(\w+):\s*\[(.*?)\]", body, re.S):
        key = block.group(1)
        if key not in VOICES:
            continue
        translations = re.findall(r"translation:\s*(['\"])(.*?)\1", block.group(2), re.S)
        result[key] = [t[1] for t in translations]
    return result


async def main() -> int:
    phrases = parse_phrasebook()
    if not phrases:
        print("No phrases parsed — check phrasebook.ts format.", file=sys.stderr)
        return 1
    made, skipped, failed = 0, 0, 0
    for language, translations in phrases.items():
        voice = VOICES[language]
        lang_dir = OUT / language
        lang_dir.mkdir(parents=True, exist_ok=True)
        for index, translation in enumerate(translations):
            out_file = lang_dir / f"{index}.mp3"
            if out_file.exists() and out_file.stat().st_size > 0:
                skipped += 1
                continue
            spoken = native_text(translation)
            try:
                communicate = edge_tts.Communicate(spoken, voice)
                await communicate.save(str(out_file))
                made += 1
                print(f"  {language}/{index}.mp3  <- {spoken}")
            except Exception as err:  # noqa: BLE001 — log and continue per-file
                failed += 1
                print(f"  FAILED {language}/{index} ({voice}): {err}", file=sys.stderr)
    print(f"\nDone. generated={made} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
