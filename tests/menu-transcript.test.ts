import {afterEach, expect, it, vi} from 'vitest';
import {hasMenuTranscript, menuTranscript} from '../src/lib/menuTranscript';

afterEach(() => vi.restoreAllMocks());

it('keeps the text version tied to the verified menu image', async () => {
  expect(await hasMenuTranscript('data:image/jpeg;base64,/9j/REPLACEMENT')).toBe(false);
  const expectedDigest = Uint8Array.from(
    Buffer.from('24b4b613d30f84ae57c538076b9e8d6e6e3fa7ecd15fc9b8ef2420ed08a0f4db', 'hex'),
  );
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(expectedDigest.buffer);
  expect(await hasMenuTranscript('data:image/jpeg;base64,/9j/VERIFIED')).toBe(true);
  expect(menuTranscript.sections.flatMap(section => section.rows)).toHaveLength(25);
  expect(menuTranscript.sections[0].rows).toContainEqual(['هندي روبيستا', 560, null]);
});
