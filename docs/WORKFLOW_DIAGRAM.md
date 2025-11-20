# System Workflow Diagrams

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                    (React Frontend + Leaflet)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Requests
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FLASK BACKEND API                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Field Mgmt   │  │  Spot Mgmt   │  │  Analysis    │         │
│  │ Endpoints    │  │  Endpoints   │  │  Endpoints   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   SQLite     │    │  File System  │    │  AI Models   │
│  Database    │    │  (Images)     │    │  (PyTorch)   │
│              │    │               │    │              │
│ - fields     │    │ uploads/      │    │ - CustomCNN  │
│ - spots      │    │   field_1/    │    │ - EfficientNet│
│ - analysis   │    │   spot_1.jpg  │    │ - etc.       │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Workflow 1: Create Field

```
User Action                    Frontend                    Backend                    Database
─────────────────────────────────────────────────────────────────────────────────────────────
1. Click "Create Field"  →  Enable drawing mode
                              │
2. Draw polygon on map   →  Capture coordinates
   [[lat1,lng1], ...]         │
                              │
3. Click "Save Field"    →  POST /api/fields          →  Validate polygon
   Enter name                 │  {name, coords}            │
                              │                           │
                              │                           ▼
                              │                    Create Field record
                              │                           │
                              │                           ▼
                              │                    INSERT INTO fields
                              │                           │
                              │                           ▼
                              │                    Return field_id
                              │                           │
                              ▼                           │
                        Display polygon                  │
                        on map with name                  │
```

## Workflow 2: Add Spot & Analyze

```
User Action                    Frontend                    Backend                    Database/AI
─────────────────────────────────────────────────────────────────────────────────────────────
1. Select field         →  Highlight polygon
                              │
2. Click "Add Spot"     →  Enable spot mode
                              │
3. Click map location   →  Capture GPS coords
   (lat, lng)                 │
                              │
4. Upload image         →  Show preview
                              │
5. Click "Analyze"      →  POST /api/fields/1/spots  →  Validate coordinates
                              │  FormData:                │  (point-in-polygon)
                              │  - image                  │
                              │  - latitude               │
                              │  - longitude              │
                              │                           │
                              │                           ▼
                              │                    Save image to disk
                              │                    uploads/field_1/
                              │                           │
                              │                           ▼
                              │                    INSERT INTO spots
                              │                           │
                              │                           ▼
                              │                    Call AI model
                              │                    (analyze_crop_image)
                              │                           │
                              │                           ▼
                              │                    Store analysis
                              │                    INSERT INTO analysis_results
                              │                           │
                              │                           ▼
                              │                    Return spot + analysis
                              │                           │
                              ▼                           │
                        Add marker to map                 │
                        (color by health)                 │
                        Show analysis panel               │
```

## Workflow 3: Visualize Disease Distribution

```
User Action                    Frontend                    Backend                    Database
─────────────────────────────────────────────────────────────────────────────────────────────
1. Select field         →  GET /api/fields/1        →  Query field + spots
                              │                           │
                              │                           ▼
                              │                    SELECT fields.*, spots.*,
                              │                    analysis_results.*
                              │                    WHERE field_id = 1
                              │                           │
                              │                           ▼
                              │                    Return field with spots
                              │                           │
                              ▼                           │
                        Render markers on map             │
                        (color-coded by health)           │
                              │
2. Click "Summary"      →  GET /api/fields/1/      →  Aggregate analysis
                              │  analysis-summary         │
                              │                           │
                              │                           ▼
                              │                    COUNT by health_label
                              │                    Build heatmap data
                              │                           │
                              │                           ▼
                              │                    Return summary
                              │                           │
                              ▼                           │
                        Display statistics                │
                        Show heatmap overlay              │
                        Show distribution chart           │
```

## Data Flow: Spot Analysis

```
┌─────────────┐
│ Image Upload│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Validate Coords │  ← Check point-in-polygon
│ (Inside Field?) │
└──────┬──────────┘
       │ Yes
       ▼
┌─────────────────┐
│  Save Image     │  → uploads/field_X/spot_Y.jpg
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Store Spot     │  → INSERT INTO spots
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Assess Quality  │  → Blur, exposure check
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Load AI Model  │  → PyTorch model inference
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Map to Schema  │  → health_label, findings
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Store Analysis  │  → INSERT INTO analysis_results
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Return Results  │  → JSON response
└─────────────────┘
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                      React App Component                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              MapView Component                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │         LeafletMap (Map Container)             │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐          │  │  │
│  │  │  │ FieldPolygon │  │ SpotMarkers   │          │  │  │
│  │  │  │   Layer      │  │   Layer       │          │  │  │
│  │  │  └──────────────┘  └──────────────┘          │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐          │  │  │
│  │  │  │ HeatmapLayer │  │ DrawingTools  │          │  │  │
│  │  │  └──────────────┘  └──────────────┘          │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              FieldSidebar Component                  │  │
│  │  - Field list                                         │  │
│  │  - Create/Delete fields                               │  │
│  │  - Select active field                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              SpotUploader Component                   │  │
│  │  - Image upload                                        │  │
│  │  - GPS capture                                         │  │
│  │  - Analysis display                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         AnalysisVisualization Component               │  │
│  │  - Health distribution                                 │  │
│  │  - Disease heatmap                                    │  │
│  │  - Statistics panel                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ Axios HTTP Requests
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Flask Backend API                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ /api/fields  │  │ /api/spots   │  │ /api/analyze │       │
│  │              │  │              │  │              │       │
│  │ POST, GET,   │  │ POST, GET,   │  │ POST         │       │
│  │ DELETE       │  │ DELETE       │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
Frontend State:
┌─────────────────────────────────────────┐
│ fields: [                               │
│   {id: 1, name: "Field A", ...},        │
│   {id: 2, name: "Field B", ...}        │
│ ]                                       │
│                                         │
│ selectedField: {id: 1, ...}             │
│                                         │
│ spots: [                                │
│   {id: 1, lat: -23.5, lng: -46.6,      │
│    analysis: {health_label: "diseased"}}│
│ ]                                       │
│                                         │
│ drawingMode: "field" | "spot"           │
└─────────────────────────────────────────┘
         │                    │
         │                    │
         ▼                    ▼
    API Calls          Map Rendering
    (Axios)            (Leaflet)
```

## Error Handling Flow

```
User Action → Frontend → Backend → Database/AI
                │          │           │
                │          │           │
                ▼          ▼           ▼
            Try/Catch  Try/Except   Try/Except
                │          │           │
                │          │           │
                ▼          ▼           ▼
            Error State  Error JSON  Rollback
                │          │
                │          │
                ▼          ▼
            Display      Return
            Error UI     Error Response
```

## Marker Color Coding

```
Health Label          →  Marker Color  →  CSS Class
─────────────────────────────────────────────────────
healthy              →  Green          →  .marker-healthy
mildly_stressed      →  Yellow        →  .marker-stressed
diseased             →  Orange        →  .marker-diseased
pest_damage          →  Red           →  .marker-pest
nutrient_deficiency  →  Purple        →  .marker-nutrient
unknown              →  Gray          →  .marker-unknown
```

## Database Relationships

```
fields (1) ──────< (many) spots (1) ──────< (1) analysis_results
   │                    │                          │
   │                    │                          │
   │                    │                          │
   └────────────────────┴──────────────────────────┘
                    (Cascade Delete)
```

## API Request/Response Examples

### Create Field
```
POST /api/fields
Request:  {"name": "Field A", "polygon_coordinates": [[...]]}
Response: {"id": 1, "name": "Field A", ...}
```

### Add Spot
```
POST /api/fields/1/spots
Request:  FormData {image, latitude, longitude}
Response: {"spot": {...}, "analysis": {...}}
```

### Get Analysis Summary
```
GET /api/fields/1/analysis-summary
Response: {
  "health_distribution": {"healthy": 3, "diseased": 5},
  "disease_heatmap": [{lat, lng, severity}, ...]
}
```

