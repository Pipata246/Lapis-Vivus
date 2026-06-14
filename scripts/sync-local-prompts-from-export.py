#!/usr/bin/env python3
"""Синхронизация src/prompts/* из экспорта БД (сообщение пользователя в transcript)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / 'src' / 'prompts'
TRANSCRIPT = Path(
    r'C:\Users\User\.cursor\projects\c-Users-User-OneDrive-Lapis-Vivus-main'
    r'\agent-transcripts\bba8147c-5c16-42c8-9ecb-aecbd62bcfae'
    r'\bba8147c-5c16-42c8-9ecb-aecbd62bcfae.jsonl'
)

MARKERS = [
    ('bibliography.txt', r'библиография:\s*\n'),
    ('lapis-blocks-v31.txt', r'\nблоки:\s*\n\n'),
    ('calculators.txt', r'\nкалькулятор:\s*\n'),
    ('lapis-system.txt', r'\nсистем:\s*\n'),
    ('glossary.txt', r'\nглоссарий:\s*\n'),
]


def main():
    text = ''
    for line in open(TRANSCRIPT, encoding='utf-8'):
        obj = json.loads(line)
        if obj.get('role') == 'user':
            body = obj.get('message', {}).get('content', [{}])[0].get('text', '')
            if 'библиография:' in body and 'блоки:' in body:
                text = body
                break
    if not text:
        raise SystemExit('Export message not found in transcript')

    for i, (fname, pat) in enumerate(MARKERS):
        m = re.search(pat, text, re.I)
        if not m:
            raise SystemExit(f'Marker not found: {fname}')
        start = m.end()
        end = len(text)
        for j in range(i + 1, len(MARKERS)):
            m2 = re.search(MARKERS[j][1], text[m.end() :], re.I)
            if m2:
                end = m.end() + m2.start()
                break
        content = text[start:end].strip()
        out = PROMPTS / fname
        out.write_text(content, encoding='utf-8')
        print(f'OK {fname}: {len(content)} chars')

    # DB prompts.system — один файл, без lapis-core
    core = PROMPTS / 'lapis-core.txt'
    core.write_text(
        '# Локальный mirror: prompts.system хранится целиком в lapis-system.txt (как в Supabase).\n',
        encoding='utf-8',
    )
    print('OK lapis-core.txt: stub only')


if __name__ == '__main__':
    main()
