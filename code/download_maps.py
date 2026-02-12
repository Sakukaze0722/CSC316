import urllib.request
import os
import json

MAP_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"

# Multiple sources to try for radar images
RADAR_SOURCES = {
    "de_mirage": [
        "https://raw.githubusercontent.com/boltgolt/boltobserv/main/maps/de_mirage/radar.png",
        "https://raw.githubusercontent.com/zool/cs2-radar-images/main/de_mirage.png",
        "https://raw.githubusercontent.com/2mlml/cs2-radar-images/master/de_mirage.png",
    ],
    "de_dust2": [
        "https://raw.githubusercontent.com/boltgolt/boltobserv/main/maps/de_dust2/radar.png",
        "https://raw.githubusercontent.com/zool/cs2-radar-images/main/de_dust2.png",
        "https://raw.githubusercontent.com/2mlml/cs2-radar-images/master/de_dust2.png",
    ],
    "de_inferno": [
        "https://raw.githubusercontent.com/boltgolt/boltobserv/main/maps/de_inferno/radar.png",
        "https://raw.githubusercontent.com/zool/cs2-radar-images/main/de_inferno.png",
        "https://raw.githubusercontent.com/2mlml/cs2-radar-images/master/de_inferno.png",
    ],
}

# CS2 radar coordinate metadata (from game files)
# pos_x, pos_y: top-left corner of the radar image in game coordinates
# scale: game units per pixel
MAP_META = {
    "de_mirage": {"pos_x": -3230, "pos_y": 1713, "scale": 5.00},
    "de_dust2":  {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
}

def download_image(map_name, urls):
    output_path = os.path.join(MAP_DIR, f"{map_name}.png")
    if os.path.exists(output_path):
        print(f"  {map_name}.png already exists, skipping")
        return True
    
    for url in urls:
        try:
            print(f"  Trying: {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            response = urllib.request.urlopen(req, timeout=15)
            data = response.read()
            with open(output_path, "wb") as f:
                f.write(data)
            print(f"  ✓ Downloaded {map_name}.png ({len(data)} bytes)")
            return True
        except Exception as e:
            print(f"  ✗ Failed: {e}")
    return False

def main():
    os.makedirs(MAP_DIR, exist_ok=True)
    
    print("=== Downloading CS2 Radar Map Images ===")
    results = {}
    for map_name, urls in RADAR_SOURCES.items():
        print(f"\n{map_name}:")
        success = download_image(map_name, urls)
        results[map_name] = success
    
    # Save coordinate metadata
    meta_path = os.path.join(MAP_DIR, "map_metadata.json")
    with open(meta_path, "w") as f:
        json.dump(MAP_META, f, indent=2)
    print(f"\nSaved map metadata to {meta_path}")
    
    print("\n=== Results ===")
    for map_name, success in results.items():
        status = "✓" if success else "✗ FAILED"
        print(f"  {map_name}: {status}")
    
    return all(results.values())

if __name__ == "__main__":
    main()
