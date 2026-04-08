import math
import requests

# --- 1. FONCTIONS MATHÉMATIQUES (geo_math.py) ---

def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calcule l'azimut (cap) entre deux coordonnées GPS."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    d_lon = lon2 - lon1
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    
    bearing = math.atan2(y, x)
    bearing = math.degrees(bearing)
    return (bearing + 360) % 360  # Normaliser entre 0 et 360°

def is_in_fov(target_bearing, camera_heading, fov_degrees=60):
    """Vérifie si la cible est dans le champ de vision de la caméra."""
    # Calcul de la différence d'angle la plus courte (gère le passage par 360/0)
    diff = (target_bearing - camera_heading + 180) % 360 - 180
    
    # Si la différence absolue est inférieure à la moitié du FOV, on la voit
    return abs(diff) <= (fov_degrees / 2)

# --- 2. APPEL API (flight_api.py) ---

def get_flights_around(lat, lon, radius_km=50):
    """Récupère les vols OpenSky dans un carré approximatif."""
    # 1 degré de latitude correspond à environ 111 km
    delta_deg = radius_km / 111.0 
    
    lamin = lat - delta_deg
    lomin = lon - delta_deg
    lamax = lat + delta_deg
    lomax = lon + delta_deg
    
    # API publique d'OpenSky (Aucune clé API nécessaire pour les requêtes basiques)
    url = f"https://opensky-network.org/api/states/all?lamin={lamin}&lomin={lomin}&lamax={lamax}&lomax={lomax}"
    
    print(f"Interrogation de l'API OpenSky...")
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        return data.get('states') or []
    else:
        print(f"Erreur API : {response.status_code}")
        return []

# --- 3. ORCHESTRATEUR (main.py) ---

if __name__ == "__main__":
    # Tes coordonnées fictives (Exemple: Place du Capitole, Toulouse)
    MY_LAT = 43.6047
    MY_LON = 1.4442
    
    # L'orientation de ton téléphone (Boussole)
    # 0 = Nord, 90 = Est, 180 = Sud, 270 = Ouest
    MY_HEADING = 180  # Imaginons que tu regardes vers l'Est
    MY_FOV = 60      # Un téléphone standard voit sur environ 60 degrés de large
    
    print(f"Ma position : {MY_LAT}, {MY_LON}")
    print(f"Je regarde au cap : {MY_HEADING}° (FOV: ±{MY_FOV/2}°)\n")
    
    flights = get_flights_around(MY_LAT, MY_LON, radius_km=100)
    print(f"{len(flights)} aéronefs trouvés dans un rayon de 100km.\n")
    
    for f in flights:
        callsign = str(f[1]).strip() or "Inconnu"
        plane_lon = f[5]
        plane_lat = f[6]
        altitude = f[7]
        
        # Ignorer les vols sans position au sol connue
        if plane_lat is None or plane_lon is None:
            continue
            
        # 1. Calcul de la direction de l'avion par rapport à nous
        bearing = calculate_bearing(MY_LAT, MY_LON, plane_lat, plane_lon)
        
        # 2. Vérification s'il est dans notre objectif caméra
        if is_in_fov(bearing, MY_HEADING, MY_FOV):
            print(f"CIBLE REPÉRÉE DANS LA CAMÉRA !")
            print(f"   Vol: {callsign} | Azimut: {bearing:.1f}° | Altitude: {altitude}m")
            print(f"   Position: {plane_lat}, {plane_lon}\n")