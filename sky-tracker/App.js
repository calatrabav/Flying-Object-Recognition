import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';

// ⚠️ REMPLACE PAR L'ADRESSE IP LOCALE DE TON ORDINATEUR (ex: 192.168.1.25)
const BACKEND_URL = "http://192.168.1.31:8000/analyze";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [location, setLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  
  const cameraRef = useRef(null);

  // Initialisation des capteurs au lancement
  useEffect(() => {
    (async () => {
      // 1. Permission GPS
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Erreur', 'Permission de localisation refusée');
        return;
      }

      // 2. Écoute de la Boussole (Magnétomètre)
      Magnetometer.setUpdateInterval(500); // Mise à jour toutes les demi-secondes
      Magnetometer.addListener(data => {
        let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
        angle = angle >= 0 ? angle : angle + 360;
        console.log("Données boussole:", Math.round(angle)); // <-- AJOUTE CETTE LIGNE
        setHeading(Math.round(angle));
      });
    })();
    
    return () => Magnetometer.removeAllListeners();
  }, []);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{textAlign: 'center', marginBottom: 20}}>Nous avons besoin de la caméra</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.text}>Accorder la permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Fonction principale : Capture et Envoi
  const takePictureAndAnalyze = async () => {
    if (!cameraRef.current) return;

    try {
      setIsAnalyzing(true);
      setResult(null);

      // 1. Prendre la photo
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      
      // 2. Récupérer la position GPS exacte à l'instant T
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);

      // 3. Préparer les données pour le Backend (Multipart FormData)
      const formData = new FormData();
      formData.append('image', {
        uri: photo.uri,
        name: 'capture.jpg',
        type: 'image/jpeg',
      });
      formData.append('latitude', loc.coords.latitude.toString());
      formData.append('longitude', loc.coords.longitude.toString());
      formData.append('heading', heading.toString());

      // 4. Envoyer au serveur Python
      console.log(`Envoi... Cap: ${heading}°, Lat: ${loc.coords.latitude}`);
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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

  return (
    <View style={styles.container}>
      {/* 1. La caméra en plein écran (arrière-plan) */}
      <CameraView style={StyleSheet.absoluteFillObject} facing="back" ref={cameraRef} />

      {/* 2. Affichage des capteurs en temps réel (Superposé) */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>🧭 Cap Boussole : {heading}°</Text>
      </View>

      {/* 3. Interface du bas (Superposée) */}
      <View style={styles.bottomBar}>
        {isAnalyzing ? (
          <ActivityIndicator size="large" color="#00ff00" />
        ) : (
          <TouchableOpacity style={styles.captureButton} onPress={takePictureAndAnalyze}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        )}
      </View>

      {/* 4. Affichage du résultat */}
      {result && (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>
            {result.source === 'radar' ? '📡 Radar (Plan A)' : '🤖 IA (Plan B)'}
          </Text>
          <Text style={styles.resultText}>
            {result.source === 'radar' 
              ? `Vol: ${result.data.callsign} | Alt: ${result.data.altitude_m}m` 
              : `Identification: ${result.data.type} (${Math.round(result.data.confidence * 100)}%)`}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={() => setResult(null)}>
            <Text style={styles.text}>Fermer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  camera: { flex: 1 },
  hud: { 
    position: 'absolute', 
    top: 80, // On descend l'encart pour éviter l'encoche
    left: 20, 
    backgroundColor: 'rgba(0,0,0,0.7)', // Fond un peu plus sombre
    padding: 15, 
    borderRadius: 8,
    zIndex: 10 // Force l'affichage au premier plan
  },
  hudText: { color: 'white', fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'white' },
  resultPanel: { position: 'absolute', bottom: 120, left: 20, right: 20, backgroundColor: 'white', padding: 20, borderRadius: 15, alignItems: 'center' },
  resultTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  resultText: { fontSize: 16, marginBottom: 15, textAlign: 'center' },
  button: { backgroundColor: '#2196F3', padding: 10, borderRadius: 8 },
  closeButton: { backgroundColor: '#f44336', padding: 10, borderRadius: 8, width: '100%', alignItems: 'center' },
  text: { color: 'white', fontWeight: 'bold' },
});