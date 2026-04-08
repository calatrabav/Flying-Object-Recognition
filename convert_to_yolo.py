import os
import shutil
from PIL import Image

# --- CONFIGURATION DES CHEMINS ---
# Remplace par le chemin réel vers le dossier "data" de ton dataset FGVC
FGVC_DATA_DIR = "./data/archive/fgvc-aircraft-2013b/fgvc-aircraft-2013b/data" 
OUTPUT_DIR = "./yolo_aircraft_dataset"

# Création de l'arborescence YOLO
for split in ['train', 'val']:
    os.makedirs(os.path.join(OUTPUT_DIR, 'images', split), exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, 'labels', split), exist_ok=True)

# --- 1. CHARGEMENT DES BOÎTES (BOUNDING BOXES) ---
boxes = {}
with open(os.path.join(FGVC_DATA_DIR, 'images_box.txt'), 'r') as f:
    for line in f:
        parts = line.strip().split()
        image_id = parts[0]
        # FGVC donne : xmin, ymin, xmax, ymax
        boxes[image_id] = [float(x) for x in parts[1:]]

# --- 2. EXTRACTION DES CLASSES UNIQUES ---
classes = []
with open(os.path.join(FGVC_DATA_DIR, 'variants.txt'), 'r') as f:
    classes = [line.strip() for line in f]
class_to_id = {cls_name: i for i, cls_name in enumerate(classes)}

# --- 3. FONCTION DE CONVERSION ---
def process_dataset_split(split_name, fgvc_txt_file):
    print(f"Traitement du set : {split_name}...")
    
    with open(os.path.join(FGVC_DATA_DIR, fgvc_txt_file), 'r') as f:
        lines = f.readlines()
        
    for line in lines:
        parts = line.strip().split(' ', 1)
        image_id = parts[0]
        class_name = parts[1]
        
        if class_name not in class_to_id:
            continue
            
        class_id = class_to_id[class_name]
        xmin, ymin, xmax, ymax = boxes[image_id]
        
        # Récupération des dimensions de l'image pour normaliser
        img_path = os.path.join(FGVC_DATA_DIR, 'images', f"{image_id}.jpg")
        try:
            with Image.open(img_path) as img:
                img_width, img_height = img.size
        except FileNotFoundError:
            continue

        # Mathématiques : Conversion FGVC -> YOLO
        x_center = ((xmin + xmax) / 2) / img_width
        y_center = ((ymin + ymax) / 2) / img_height
        width = (xmax - xmin) / img_width
        height = (ymax - ymin) / img_height
        
        # Copie de l'image vers le dossier YOLO
        dst_img_path = os.path.join(OUTPUT_DIR, 'images', split_name, f"{image_id}.jpg")
        shutil.copy(img_path, dst_img_path)
        
        # Création du fichier label .txt YOLO
        label_path = os.path.join(OUTPUT_DIR, 'labels', split_name, f"{image_id}.txt")
        with open(label_path, 'w') as label_file:
            label_file.write(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n")

# --- 4. EXÉCUTION ---
process_dataset_split('train', 'images_variant_train.txt')
process_dataset_split('val', 'images_variant_val.txt')

print("Conversion terminée avec succès ! Le dataset YOLO est prêt.")