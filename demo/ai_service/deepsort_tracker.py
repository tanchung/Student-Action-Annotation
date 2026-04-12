"""
DeepSORT + ReID Tracker Implementation
Combines appearance features (ReID) with motion prediction (Kalman Filter)
and Hungarian algorithm for multi-object tracking.
"""

import numpy as np
import cv2
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
from scipy.optimize import linear_sum_assignment
from filterpy.kalman import KalmanFilter
import torch
import torchvision.models as models
from torchvision.models import MobileNet_V2_Weights
from PIL import Image
from torchvision.transforms import Compose, Resize, ToTensor, Normalize


@dataclass
class Detection:
    """Detection object with bbox and appearance feature"""
    bbox: np.ndarray  # [x, y, w, h]
    confidence: float
    class_name: str
    feature: Optional[np.ndarray] = None
    track_id: Optional[int] = None


@dataclass
class Track:
    """Track object maintaining state and appearance history"""
    track_id: int
    bbox: np.ndarray  # [x, y, w, h]
    kalman_filter: KalmanFilter
    features: List[np.ndarray]
    age: int = 1
    time_since_update: int = 0
    hits: int = 1
    max_features: int = 100
    
    def update(self, detection: Detection) -> None:
        """Update track with new detection"""
        self.bbox = detection.bbox
        self.hits += 1
        self.time_since_update = 0
        if detection.feature is not None:
            self.features.append(detection.feature)
            if len(self.features) > self.max_features:
                self.features.pop(0)
        
        # Update Kalman filter
        x, y, w, h = detection.bbox
        self.kalman_filter.x[:4] = np.array([x, y, w, h])
        self.kalman_filter.update(np.array([x, y, w, h]))
    
    def predict(self) -> np.ndarray:
        """Predict next bbox using Kalman filter"""
        self.age += 1
        self.kalman_filter.predict()
        x, y, w, h = self.kalman_filter.x[:4]
        return np.array([x, y, w, h])
    
    def get_appearance_feature(self) -> Optional[np.ndarray]:
        """Get average appearance feature"""
        if not self.features:
            return None
        return np.mean(self.features, axis=0)
    
    def mark_missed(self) -> None:
        """Mark track as not updated in current frame"""
        self.time_since_update += 1


class ReIDFeatureExtractor:
    """Extract appearance features from person detections using CNN"""
    
    def __init__(self, model_name: str = "mobilenet_v2", device: str = "cpu"):
        """Initialize ReID feature extractor
        
        Args:
            model_name: Name of pretrained model (mobilenet_v2, resnet50, etc)
            device: 'cpu' or 'cuda'
        """
        self.device = device
        self.model = None

        # Try loading pretrained ReID backbone. If unavailable (offline), fallback to no-pretrained.
        try:
            if model_name == "mobilenet_v2":
                backbone = models.mobilenet_v2(weights=MobileNet_V2_Weights.DEFAULT)
            else:
                backbone = getattr(models, model_name)(weights="DEFAULT")
        except Exception:
            if model_name == "mobilenet_v2":
                backbone = models.mobilenet_v2(weights=None)
            else:
                backbone = getattr(models, model_name)(weights=None)

        if model_name == "mobilenet_v2":
            self.model = backbone.features
        else:
            self.model = torch.nn.Sequential(*list(backbone.children())[:-1])
        self.pool = torch.nn.AdaptiveAvgPool2d((1, 1))
        self.model.to(device)
        self.model.eval()
        
        # Image preprocessing
        self.transform = Compose([
            Resize((256, 128)),
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406],
                     std=[0.229, 0.224, 0.225])
        ])
    
    def extract(self, frame: np.ndarray, bbox: np.ndarray) -> Optional[np.ndarray]:
        """Extract appearance feature from bounding box region
        
        Args:
            frame: Input frame (BGR)
            bbox: [x, y, w, h] in pixel coordinates
            
        Returns:
            Feature vector (1D numpy array) or None if extraction fails
        """
        try:
            x, y, w, h = bbox.astype(int)
            x = max(0, x)
            y = max(0, y)
            x_end = min(frame.shape[1], x + w)
            y_end = min(frame.shape[0], y + h)
            
            if x_end <= x or y_end <= y:
                return None
            
            roi = frame[y:y_end, x:x_end]
            # Convert BGR to RGB for preprocessing
            roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
            roi_pil = Image.fromarray(roi_rgb)
            
            # Preprocess image
            img_tensor = self.transform(roi_pil).unsqueeze(0).to(self.device)
            
            # Extract feature
            with torch.no_grad():
                feature_map = self.model(img_tensor)
                feature = self.pool(feature_map)
            
            feature = feature.cpu().numpy().flatten()
            # L2 normalization
            feature = feature / (np.linalg.norm(feature) + 1e-8)
            
            return feature
        except Exception as e:
            print(f"⚠️ Feature extraction error: {e}")
            return None


class KalmanFilterTrack:
    """Kalman Filter for motion prediction"""
    
    def __init__(self):
        """Initialize Kalman filter for 2D bounding box tracking"""
        # State: [x, y, width, height, vx, vy]
        self.kf = KalmanFilter(dim_x=6, dim_z=4)
        
        # Transition matrix
        dt = 1.0
        self.kf.F = np.array([
            [1, 0, 0, 0, dt, 0],
            [0, 1, 0, 0, 0, dt],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1],
        ])
        
        # Measurement matrix (only measure position and size)
        self.kf.H = np.array([
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
        ])
        
        # Measurement noise
        self.kf.R = np.eye(4) * 10.0
        
        # Process noise
        self.kf.Q = np.eye(6) * 0.1
        self.kf.Q[4:, 4:] *= 0.01  # Lower noise for velocity
        
        # Initial covariance
        self.kf.P = np.eye(6) * 1000.0
        self.kf.P[4:, 4:] *= 0.1
        
        self.kf.x = np.zeros(6)


class DeepSORTTracker:
    """DeepSORT Multi-Object Tracker with ReID
    
    Combines:
    - YOLO detections
    - Kalman filter for motion prediction
    - ReID features for appearance matching
    - Hungarian algorithm for data association
    """
    
    def __init__(
        self,
        max_age: int = 70,
        min_hits: int = 3,
        iou_threshold: float = 0.3,
        appearance_threshold: float = 0.5,
        matching_cost_threshold: float = 0.7,
        device: str = "cpu"
    ):
        """Initialize DeepSORT tracker
        
        Args:
            max_age: Maximum frames a track can survive without update
            min_hits: Minimum detections before track is confirmed
            iou_threshold: IoU threshold for matching
            appearance_threshold: Cosine similarity threshold for appearance
            device: 'cpu' or 'cuda'
        """
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.appearance_threshold = appearance_threshold
        self.matching_cost_threshold = matching_cost_threshold
        self.device = device
        
        self.tracks: List[Track] = []
        self.frame_count = 0
        self.next_track_id = 1
        
        # Feature extractor
        self.feature_extractor = ReIDFeatureExtractor(device=device)
    
    def update(self, frame: np.ndarray, detections: List[Detection]) -> List[Detection]:
        """Update tracker with new detections
        
        Args:
            frame: Current frame
            detections: List of Detection objects from YOLO
            
        Returns:
            List of tracked detections with track IDs
        """
        self.frame_count += 1
        
        # Extract appearance features for all detections
        for detection in detections:
            detection.feature = self.feature_extractor.extract(frame, detection.bbox)
        
        # Predict next state for existing tracks
        predicted_boxes = []
        for track in self.tracks:
            predicted_box = track.predict()
            predicted_boxes.append(predicted_box)
        
        # Perform data association (matching)
        matched, unmatched_dets, unmatched_trks = self._match_detections(
            detections, predicted_boxes
        )
        
        # Update matched tracks
        for d_idx, t_idx in matched:
            self.tracks[t_idx].update(detections[d_idx])
            detections[d_idx].track_id = self.tracks[t_idx].track_id
        
        # Create new tracks for unmatched detections
        for d_idx in unmatched_dets:
            if detections[d_idx].confidence > 0.25:
                self._create_new_track(detections[d_idx])
                detections[d_idx].track_id = self.next_track_id - 1
        
        # Mark unmatched tracks as missed
        for t_idx in unmatched_trks:
            self.tracks[t_idx].mark_missed()
        
        # Remove dead tracks
        self.tracks = [t for t in self.tracks 
                      if t.time_since_update <= self.max_age]
        
        return detections
    
    def _match_detections(
        self,
        detections: List[Detection],
        predicted_boxes: List[np.ndarray]
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        """Match detections to tracks using IoU and appearance similarity
        
        Returns:
            (matched_pairs, unmatched_detection_indices, unmatched_track_indices)
        """
        if not self.tracks or not detections:
            return [], list(range(len(detections))), list(range(len(self.tracks)))
        
        n_detections = len(detections)
        n_tracks = len(self.tracks)
        
        # Build cost matrix
        cost_matrix = np.zeros((n_detections, n_tracks))
        
        for d_idx, detection in enumerate(detections):
            for t_idx, track in enumerate(self.tracks):
                # Combine IoU and appearance distance
                iou_cost = 1.0 - self._iou(detection.bbox, predicted_boxes[t_idx])
                
                # Appearance distance (if both have features)
                app_cost = 1.0
                if detection.feature is not None and track.get_appearance_feature() is not None:
                    similarity = np.dot(
                        detection.feature,
                        track.get_appearance_feature()
                    )
                    app_cost = 1.0 - max(0, similarity)  # Convert to cost

                det_center = np.array(
                    [
                        detection.bbox[0] + (detection.bbox[2] / 2.0),
                        detection.bbox[1] + (detection.bbox[3] / 2.0),
                    ],
                    dtype=float,
                )
                pred_center = np.array(
                    [
                        predicted_boxes[t_idx][0] + (predicted_boxes[t_idx][2] / 2.0),
                        predicted_boxes[t_idx][1] + (predicted_boxes[t_idx][3] / 2.0),
                    ],
                    dtype=float,
                )
                center_dist = float(np.linalg.norm(det_center - pred_center))
                dist_cost = min(center_dist / 200.0, 1.0)
                
                # Combined cost (weighted average)
                weight_iou = 0.4
                weight_app = 0.4
                weight_dist = 0.2
                cost_matrix[d_idx, t_idx] = (
                    (weight_iou * iou_cost)
                    + (weight_app * app_cost)
                    + (weight_dist * dist_cost)
                )
        
        # Apply Hungarian algorithm
        det_indices, track_indices = linear_sum_assignment(cost_matrix)
        
        matched = []
        for d_idx, t_idx in zip(det_indices, track_indices):
            # Only match if cost is below threshold
            if cost_matrix[d_idx, t_idx] < self.matching_cost_threshold:
                matched.append((d_idx, t_idx))
        
        unmatched_dets = [d for d in range(n_detections) 
                         if d not in [m[0] for m in matched]]
        unmatched_trks = [t for t in range(n_tracks) 
                         if t not in [m[1] for m in matched]]
        
        return matched, unmatched_dets, unmatched_trks
    
    def _iou(self, bbox1: np.ndarray, bbox2: np.ndarray) -> float:
        """Calculate IoU between two bboxes [x, y, w, h]"""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2
        
        left = max(x1, x2)
        top = max(y1, y2)
        right = min(x1 + w1, x2 + w2)
        bottom = min(y1 + h1, y2 + h2)
        
        inter_w = max(0, right - left)
        inter_h = max(0, bottom - top)
        inter_area = inter_w * inter_h
        
        area1 = w1 * h1
        area2 = w2 * h2
        union = area1 + area2 - inter_area
        
        if union <= 0:
            return 0.0
        return inter_area / union
    
    def _create_new_track(self, detection: Detection) -> None:
        """Create a new track for detection"""
        track = Track(
            track_id=self.next_track_id,
            bbox=detection.bbox,
            kalman_filter=KalmanFilterTrack().kf,
            features=[]
        )
        
        # Initialize Kalman filter with detection
        x, y, w, h = detection.bbox
        track.kalman_filter.x[:4] = np.array([x, y, w, h])
        
        if detection.feature is not None:
            track.features.append(detection.feature)
        
        self.tracks.append(track)
        self.next_track_id += 1
    
    def get_confirmed_tracks(self) -> List[Dict]:
        """Get confirmed tracks (with enough hits)
        
        Returns:
            List of confirmed track dictionaries
        """
        confirmed = []
        for track in self.tracks:
            if track.hits >= self.min_hits and track.time_since_update == 0:
                confirmed.append({
                    'track_id': track.track_id,
                    'bbox': track.bbox,
                    'age': track.age,
                    'hits': track.hits
                })
        return confirmed
