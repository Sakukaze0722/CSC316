import urllib.request
import os
import json

MAP_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"
META_PATH = os.path.join(MAP_DIR, "map_metadata.json")

TRAIN_URLS = [
    "https://raw.githubusercontent.com/2mlml/cs2-radar-images/master/de_train.png",
    "https://raw.githubusercontent.com/zool/cs2-radar-images/main/de_train.png",
    "https://raw.githubusercontent.com/boltgolt/boltobserv/main/maps/de_train/radar.png",
]

TRAIN_META = {
    "pos_x": -2308,
    "pos_y": 2078,
    "scale": 4.082077
}

def main():
    os.makedirs(MAP_DIR, exist_ok=True)
    output_path = os.path.join(MAP_DIR, "de_train.png")

    if os.path.exists(output_path):
        print(f"de_train.png already exists ({os.path.getsize(output_path)} bytes)")
    else:
        for url in TRAIN_URLS:
            try:
                print(f"Trying: {url}")
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                response = urllib.request.urlopen(req, timeout=15)
                data = response.read()
                with open(output_path, "wb") as f:
                    f.write(data)
                print(f"Downloaded de_train.png ({len(data)} bytes)")
                break
            except Exception as e:
                print(f"Failed: {e}")
        else:
            print("ERROR: Could not download de_train.png from any source")
            return

    # Update map_metadata.json
    with open(META_PATH, "r") as f:
        meta = json.load(f)

    meta["de_train"] = TRAIN_META

    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Updated {META_PATH} with de_train metadata")

if __name__ == "__main__":
    main()
