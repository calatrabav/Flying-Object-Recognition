import os
import shutil
from ultralytics import YOLO
from PIL import Image

# --- CONFIGURATION ---
INPUT_DIR = "./data/comm_aircraft_dataset_2/Commercial aircraft classification"  # <-- Mets le bon chemin vers ton dataset ici
OUTPUT_DIR = "./yolo_flying_aircraft"

# On charge le modèle YOLO de base (pré-entraîné sur des millions d'images générales)
# Il sait ce qu'est un "avion" (classe 4 dans COCO dataset) mais pas quel modèle c'est.
print("Chargement du modèle YOLO de base...")
base_model = YOLO("yolov8n.pt") 

# Préparation de l'arborescence de sortie
for split in ['train', 'val']:
    os.makedirs(os.path.join(OUTPUT_DIR, 'images', split), exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, 'labels', split), exist_ok=True)

# Détection des classes (les noms des dossiers)
classes = []
train_dir = os.path.join(INPUT_DIR, "train")
if os.path.exists(train_dir):
    classes = [d for d in os.listdir(train_dir) if os.path.isdir(os.path.join(train_dir, d))]
class_to_id = {cls_name: i for i, cls_name in enumerate(classes)}

print(f"{len(classes)} classes détectées : {classes}")

def process_folder(input_split, output_split):
    split_dir = os.path.join(INPUT_DIR, input_split)
    if not os.path.exists(split_dir):
        return

    print(f"Traitement du dossier {input_split}...")
    
    for class_name in classes:
        class_dir = os.path.join(split_dir, class_name)
        if not os.path.exists(class_dir):
            continue
            
        class_id = class_to_id[class_name]
        
        for filename in os.listdir(class_dir):
            if not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
                
            img_path = os.path.join(class_dir, filename)
            
            # 1. L'IA de base analyse l'image (classes=[4] signifie : cherche uniquement les avions)
            results = base_model.predict(img_path, classes=[4], verbose=False)
            result = results[0]
            
            # Si aucun avion n'est détecté dans le ciel, on ignore l'image
            if len(result.boxes) == 0:
                continue
                
            # On prend la boîte de l'avion avec le meilleur score
            best_box = result.boxes[0]
            x_c, y_c, w, h = best_box.xywhn[0].tolist() # Coordonnées normalisées pour YOLO
            
            # 2. Copie de l'image
            new_img_name = f"{class_name.replace(' ', '_')}_{filename}"
            shutil.copy(img_path, os.path.join(OUTPUT_DIR, 'images', output_split, new_img_name))
            
            # 3. Création du fichier texte avec NOTRE label
            label_path = os.path.join(OUTPUT_DIR, 'labels', output_split, new_img_name.replace('.jpg', '.txt').replace('.jpeg', '.txt').replace('.png', '.txt'))
            with open(label_path, 'w') as f:
                f.write(f"{class_id} {x_c:.6f} {y_c:.6f} {w:.6f} {h:.6f}\n")

# Lancement (on considère 'test' comme 'val' pour YOLO)
process_folder('train', 'train')
process_folder('test', 'val')

# --- GÉNÉRATION DU YAML ---
import yaml
yaml_content = {
    'path': os.path.abspath(OUTPUT_DIR),
    'train': 'images/train',
    'val': 'images/val',
    'nc': len(classes),
    'names': classes
}
with open(os.path.join(OUTPUT_DIR, 'flying_aircraft.yaml'), 'w') as f:
    yaml.dump(yaml_content, f, sort_keys=False)

print("Conversion terminée ! Le dataset est prêt dans le dossier 'yolo_flying_aircraft'.")