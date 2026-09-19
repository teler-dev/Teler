import unittest

from core.auto_update import UpdateInfo, _validated_update, is_newer_version


class AutoUpdateTests(unittest.TestCase):
    def test_compares_numeric_versions(self):
        self.assertTrue(is_newer_version("2026.10.1", "2026.9.19"))
        self.assertFalse(is_newer_version("2026.9.19", "2026.9.19"))

    def test_rejects_untrusted_or_unchecked_updates(self):
        with self.assertRaises(ValueError):
            _validated_update({"version": "2026.9.22", "download_url": "https://example.com/TELER.exe", "sha256": "a" * 64})
        with self.assertRaises(ValueError):
            _validated_update({"version": "2026.9.22", "download_url": "https://teler-pi.vercel.app/TELER.exe", "sha256": "not-a-checksum"})

    def test_accepts_new_trusted_release(self):
        update = _validated_update({"version": "2026.9.22", "download_url": "https://204-216-105-57.sslip.io/releases/TELER.exe", "sha256": "a" * 64, "notes": "Bug fixes"})
        self.assertEqual(update, UpdateInfo("2026.9.22", "https://204-216-105-57.sslip.io/releases/TELER.exe", "a" * 64, "Bug fixes", False))


if __name__ == "__main__":
    unittest.main()
