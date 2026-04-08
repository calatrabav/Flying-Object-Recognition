import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Image, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import MapView, { Marker } from 'react-native-maps';

// Activation des animations de layout sur Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BACKEND_URL = "http://192.168.1.31:8000"; 

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [location, setLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [nearbyPlanes, setNearbyPlanes] = useState([]);
  
  const [isMapEnlarged, setIsMapEnlarged] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  
  const cameraRef = useRef(null);
  const mapTimeoutRef = useRef(null);

  // --- INITIALISATION & CAPTEURS ---
  useEffect(() => {
    let interval;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Erreur', 'Permission GPS refusée');
        return;
      }

      const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(initialLoc);

      const fetchRadar = async (lat, lon) => {
        try {
          const res = await fetch(`${BACKEND_URL}/nearby?lat=${lat}&lon=${lon}`);
          const data = await res.json();
          setNearbyPlanes(data.planes || []);
        } catch (e) { console.log("Erreur radar:", e); }
      };

      fetchRadar(initialLoc.coords.latitude, initialLoc.coords.longitude);
      interval = setInterval(() => {
        fetchRadar(initialLoc.coords.latitude, initialLoc.coords.longitude);
      }, 10000); // Polling toutes les 10 secondes

      Magnetometer.setUpdateInterval(500);
      Magnetometer.addListener(data => {
        let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
        setHeading(Math.round(angle >= 0 ? angle : angle + 360));
      });
    })();

    return () => {
      if (interval) clearInterval(interval);
      Magnetometer.removeAllListeners();
      if (mapTimeoutRef.current) clearTimeout(mapTimeoutRef.current);
    };
  }, []);

  // --- ACTIONS ---
  const handleMapInteraction = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMapEnlarged(true);
    
    if (mapTimeoutRef.current) clearTimeout(mapTimeoutRef.current);
    
    mapTimeoutRef.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsMapEnlarged(false);
    }, 6000);
  };

  const takePictureAndAnalyze = async () => {
    if (!cameraRef.current) return;
    try {
      setIsAnalyzing(true);
      setResult(null);

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      setCapturedImage(photo.uri);
      
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);

      const formData = new FormData();
      formData.append('image', { uri: photo.uri, name: 'capture.jpg', type: 'image/jpeg' });
      formData.append('latitude', loc.coords.latitude.toString());
      formData.append('longitude', loc.coords.longitude.toString());
      formData.append('heading', heading.toString());

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const jsonResponse = await response.json();
      setResult(jsonResponse);
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Impossible de joindre le serveur.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- RENDU UI ---
  if (!permission?.granted) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000'}}>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.text}>Autoriser la Caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFillObject} facing="back" ref={cameraRef} />

      {/* Viseur & Boussole */}
      <View style={styles.crosshair}>
        <View style={styles.lineH} />
        <View style={styles.lineV} />
      </View>
      <View style={styles.hud}>
        <Text style={styles.hudText}>🧭 {heading}°</Text>
      </View>

      {/* Bouton Capture */}
      <View style={styles.bottomCenterBar}>
        {isAnalyzing ? (
          <ActivityIndicator size="large" color="#00ff00" />
        ) : (
          <TouchableOpacity style={styles.captureButton} onPress={takePictureAndAnalyze}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        )}
      </View>

      {/* Mini-Map Interactive */}
      {location && (
        <View style={[styles.miniMapWrapper, isMapEnlarged ? styles.miniMapEnlarged : styles.miniMapNormal]}>
          <MapView
            style={StyleSheet.absoluteFillObject}
            onPress={handleMapInteraction}
            onPanDrag={handleMapInteraction}
            initialRegion={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            showsUserLocation={true}
          >
            {nearbyPlanes.map((plane, index) => (
              <Marker
                key={index}
                coordinate={{ latitude: plane.lat, longitude: plane.lon }}
                rotation={plane.track}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <Image 
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/68/68380.png' }} 
                  style={{ width: 20, height: 20, tintColor: '#ffeb3b' }} 
                />
              </Marker>
            ))}
          </MapView>
        </View>
      )}

      {/* Panneau de Résultat */}
      {result && (
        <View style={styles.resultPanel}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.headerResult}>
              {capturedImage && <Image source={{ uri: capturedImage }} style={styles.thumbnail} />}
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={styles.resultTitle}>
                  {result.source === 'radar' ? '📡 Radar (Plan A)' : '🤖 IA (Plan B)'}
                </Text>
                
                {result.source === 'radar' ? (
                  <>
                    <Text style={styles.dataText}>✈️ Vol : <Text style={{fontWeight: 'bold'}}>{result.data.callsign}</Text></Text>
                    <Text style={styles.dataText}>🌍 Pays : {result.data.origin_country}</Text>
                    <Text style={styles.dataText}>📏 Altitude : {Math.round(result.data.altitude_m)} m</Text>
                    <Text style={styles.dataText}>⚡ Vitesse : {result.data.velocity_kmh} km/h</Text>
                  </>
                ) : (
                  <Text style={styles.dataText}>Identification : {result.data.type} ({(result.data.confidence * 100).toFixed(1)}%)</Text>
                )}
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setResult(null)}>
              <Text style={styles.text}>Fermer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  hud: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 5, zIndex: 10 },
  hudText: { color: 'white', fontWeight: 'bold' },
  
  crosshair: { position: 'absolute', top: '50%', left: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  lineH: { position: 'absolute', width: 40, height: 2, backgroundColor: 'rgba(0,255,0,0.6)' },
  lineV: { position: 'absolute', width: 2, height: 40, backgroundColor: 'rgba(0,255,0,0.6)' },

  bottomCenterBar: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'white' },

  miniMapWrapper: { position: 'absolute', bottom: 30, left: 20, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden', backgroundColor: '#333', elevation: 5, zIndex: 15 },
  miniMapNormal: { width: 150, height: 150 },
  miniMapEnlarged: { width: 220, height: 220 },

  resultPanel: { position: 'absolute', bottom: 20, left: 20, right: 20, maxHeight: '80%', backgroundColor: 'white', borderRadius: 15, zIndex: 20, overflow: 'hidden' },
  scrollContent: { padding: 20 },
  headerResult: { flexDirection: 'row', marginBottom: 15, alignItems: 'center' },
  thumbnail: { width: 80, height: 120, borderRadius: 8, backgroundColor: '#ddd' },
  resultTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  dataText: { fontSize: 14, color: '#555', marginBottom: 4 },

  button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 8 },
  closeButton: { backgroundColor: '#f44336', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center' },
  text: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});