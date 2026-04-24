import math
import requests
import io
import json
import os
from PIL import Image, ImageOps
from fastapi import FastAPI, File, UploadFile, Form
from typing import Optional
from ultralytics import YOLO

app = FastAPI(title="Sky Tracker API")

# --- 1. LOGIQUE GÉOSPATIALE & API ---

def calculate_bearing(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    d_lon = lon2 - lon1
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360) % 360

def is_in_fov(target_bearing, camera_heading, fov_degrees=60):
    diff = (target_bearing - camera_heading + 180) % 360 - 180
    return abs(diff) <= (fov_degrees / 2)

def get_flights_around(lat, lon, radius_km=50):
    delta_deg = radius_km / 111.0 
    url = f"https://opensky-network.org/api/states/all?lamin={lat-delta_deg}&lomin={lon-delta_deg}&lamax={lat+delta_deg}&lomax={lon+delta_deg}"
    try:
        response = requests.get(url, timeout=5)
        return response.json().get('states') or [] if response.status_code == 200 else []
    except Exception as e:
        print(f"Erreur API OpenSky: {e}")
        return []

# --- 2. L'IA YOLO PERSONNALISÉE (Plan B) ---

print("Chargement du modèle YOLO V2...")
ai_model = YOLO("best_v2_complet.pt") 
print("Modèle YOLO prêt !")

# Il faut faire correspondre l'ID (le numéro) avec le bon nom d'avion.
# Chargement des mapping depuis le fichier class_mappings.json généré
CLASS_NAMES_MAPPING = {}
mapping_path = "class_mappings.json"

if os.path.exists(mapping_path):
    with open(mapping_path, "r", encoding="utf-8") as f:
        mappings_data = json.load(f)
        
    # Les IDs 0 à 99 sont ceux du dataset FGVC (dans l'ordre du fichier variants.txt)
    for k, v in mappings_data.get("fgvc_aircraft_100", {}).items():
        CLASS_NAMES_MAPPING[int(k)] = v
        
    for k, v in mappings_data.get("yolo_flying_aircraft_17", {}).items():
        CLASS_NAMES_MAPPING[int(k) + 102] = v
else:
    print("Fichier class_mappings.json introuvable !")

def real_ai_predict(image_bytes):
    """Analyse l'image avec ton propre modèle YOLOv8."""
    raw_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = ImageOps.exif_transpose(raw_image)
    
    results = ai_model.predict(image, conf=0.10, verbose=True)
    result = results[0] 
    
    if len(result.boxes) == 0:
        return {
            "type": "Aucun aéronef détecté",
            "confidence": 0.0
        }
    
    best_box = result.boxes[0] 
    
    class_id = int(best_box.cls[0].item())
    confidence = float(best_box.conf[0].item())
    
    # Si l'ID n'est pas dans le dictionnaire, on affiche "Avion ID: X" par sécurité
    class_name = CLASS_NAMES_MAPPING.get(class_id, f"Modèle inconnu (ID: {class_id})")
    
    return {
        "type": class_name,
        "confidence": confidence
    }

# --- 3. ENDPOINTS ---

@app.get("/nearby")
async def get_nearby_radar(lat: float, lon: float, radius: int = 60):
    """Endpoint pour la mini-map en temps réel."""
    flights = get_flights_around(lat, lon, radius_km=radius)
    output = []
    
    for f in flights:
        if f[6] and f[5]:  # Si latitude et longitude sont présentes
            output.append({
                "callsign": str(f[1]).strip() or "Inconnu",
                "lat": f[6],
                "lon": f[5],
                "alt": f[7],
                "track": f[10] or 0,
                "velocity": round(f[9] * 3.6) if f[9] else 0
            })
    return {"planes": output}

@app.post("/analyze")
async def analyze_sky(
    image: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    heading: Optional[float] = Form(None)
):
    """Endpoint pour l'analyse d'une capture (Photo + Capteurs)."""
    print(f"Analyse demandée. Lat: {latitude}, Lon: {longitude}, Cap: {heading}°")
    image_bytes = await image.read()
    
    # --- PLAN A : Recherche Radar ---
    if latitude and longitude and heading is not None:
        flights = get_flights_around(latitude, longitude, radius_km=100)
        
        for f in flights:
            plane_lon, plane_lat = f[5], f[6]
            if not plane_lat or not plane_lon:
                continue
                
            bearing = calculate_bearing(latitude, longitude, plane_lat, plane_lon)
            
            if is_in_fov(bearing, heading, fov_degrees=60):
                print(f"Avion trouvé : {f[1]}")
                return {
                    "source": "radar",
                    "status": "success",
                    "data": {
                        "callsign": str(f[1]).strip() or "Inconnu",
                        "origin_country": f[2],
                        "altitude_m": f[7],
                        "velocity_kmh": round(f[9] * 3.6) if f[9] else 0,
                        "true_track": f[10],
                        "plane_lat": plane_lat,
                        "plane_lon": plane_lon,
                        "bearing_from_user": round(bearing, 1)
                    }
                }
    
    # --- PLAN B : Fallback IA ---
    print("Mode IA activé...")
    ai_result = real_ai_predict(image_bytes)
    return {
        "source": "ai",
        "status": "success",
        "data": ai_result
    }