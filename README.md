# ⚡ NeuRPC Stream — Real-Time Biosignal Plotter

A high-performance, full-stack web application designed for loading, decoding, streaming, and rendering multi-channel European Data Format (EDF) physiological recordings (e.g., EEG, EOG, EMG) in real time.

The application utilizes **MNE-Python** for lazy-loaded file parsing, **FastAPI + SSE (Server-Sent Events)** for binary chunk streaming, and a **Next.js + ApexCharts** frontend for declarative stacked waveform representation.

---

## 📺 Demo Video

Below is a demonstration of the application rendering EEG waveforms, shifting the dynamic timeline axis on the fly, and scrolling through all 36 channels with baseline stacking:

https://github.com/subho004/neurpc-stream/raw/main/demo/neurpc-stream-demo.mp4

<video src="https://github.com/subho004/neurpc-stream/raw/main/demo/neurpc-stream-demo.mp4" width="100%" controls autoplay loop muted></video>

---

## 🏗️ Architecture Overview

```
             ┌────────────────────────────────────────────────────────┐
             │                Browser (Next.js App)                   │
             └──────┬──────────────────────────────────────────┬──────┘
                    │                                          │
            (Fetch Metadata)                           (SSE Stream Connection)
                    │                                          │
                    ▼                                          ▼
     GET /api/v1/edf/metadata                  GET /api/v1/edf/stream?params...
             ┌────────────────────────────────────────────────────────┐
             │            FastAPI Web Server (Port 8000)              │
             │  Delegates to internal EDFService wrapper            │
             └──────────────────────────┬─────────────────────────────┘
                                        │
                              (Reads slices of EDF)
                                        │
                                        ▼
                           ┌──────────────────────────┐
                           │   MNE-Python EDF I/O     │
                           └────────────┬─────────────┘
                                        │
                               (Loads bytes on demand)
                                        ▼
                              [ SC4001E0-PSG.edf ]
```

- **Backend SSE instead of raw gRPC-Web:** Browsers cannot speak raw gRPC natively due to HTTP/2 binary framing constraints without a proxy (like Envoy). This project exposes REST endpoints and a Server-Sent Events (SSE) stream returning JSON packets with base64-encoded binary sample arrays. This matches the proto schema, bypasses complex proxy setups, and runs over standard HTTP/1.1.
- **Standalone gRPC Server:** A companion standalone gRPC server (`grpc_server.py` on `:50051`) remains active for native gRPC clients, native mobile apps, or command-line utilities like `grpcurl`.
- **Async Thread Offloading:** MNE-Python operations are blocking and synchronous. The backend uses `asyncio.to_thread` to run MNE operations in thread pools, preventing the FastAPI async event loop from getting blocked.

---

## ✨ Features

- **Multi-Channel Stacked EEG Display:** Stacked vertical rendering of up to 36 channels with customizable baseline offsets to prevent overlapping.
- **Smart Backend Scaling & DC Removal:**
  - Subtracts the baseline offset (mean of the first 10 seconds of calibration) for each channel to center waveforms around zero.
  - Multiplies EEG/EOG/EMG channels by $10^6$ (`V → µV`) on the backend so they are transmitted in readable physiological scales. Non-EEG channels (e.g., Temperature, Respiration) remain in their native units.
- **Declarative React Rendering:** Completely decoupled from imperative rendering loops, avoiding race conditions that cause waveforms to flicker or disappear.
- **Dynamic Top-Mounted X-Axis:** The time-series x-axis labels (`Time (s)`) are shown at the **top** of the chart, dynamically shifting in bounds (`minX` to `maxX`) as you navigate.
- **Debounced Navigation & Seek:** Dragging the seek bar slider or changing window limits triggers a single 200ms debounced network fetch, avoiding server spam.
- **Constrained Height Layout:** The viewport height is constrained to `100vh`, enabling the sidebar checklist of 36 channels to scroll independently without shifting layout cards off-screen.

---

## 📁 Project Structure

```
grpc-test/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py              # Configuration & env parser
│   │   │   └── grpc_config.py         # gRPC server parameters
│   │   ├── grpc/                      # Stubs and native gRPC implementation
│   │   │   ├── generated/             # Auto-generated python protobuf stubs
│   │   │   ├── server.py              # gRPC server instantiator
│   │   │   └── servicer.py            # Servicer handling channel buffers
│   │   ├── services/
│   │   │   └── edf_service.py         # MNE core reader, DC offset removal & scaling
│   │   └── api/v1/
│   │       └── router.py              # GET /edf/metadata & GET /edf/stream (SSE)
│   ├── proto/
│   │   └── edf_stream.proto           # Protobuf protocol specification
│   ├── scripts/
│   │   └── generate_proto.sh          # Stub generator script
│   ├── .env                           # Active environment settings
│   ├── main.py                        # FastAPI startup entry point
│   ├── grpc_server.py                 # Standalone gRPC startup entry point
│   └── requirements.txt               # Backend requirements (mne, numpy, fastapi, etc.)
│
├── frontend/
│   ├── app/
│   │   ├── globals.css                # Custom HSL-based dark design system
│   │   ├── layout.tsx                 # SEO tags, fonts, and HTML wrappers
│   │   └── page.tsx                   # Main entry point mounting EDFViewer
│   ├── components/edf-viewer/
│   │   ├── EDFViewer.tsx              # Component orchestrating page state
│   │   ├── WaveformChart.tsx          # Declarative ApexChart wrapping coordinate data
│   │   ├── ChannelSelector.tsx        # Grouped scrollable channel checklist
│   │   ├── TimeControls.tsx           # Seek bar slider, prev/next buttons
│   │   └── MetadataPanel.tsx          # Recording stats & subject info
│   ├── lib/
│   │   ├── grpc/
│   │   │   └── edf-client.ts          # SSE parser converting base64 -> Float32Arrays
│   │   └── hooks/
│   │       ├── useEDFMetadata.ts      # Fetch metadata hook
│   │       └── useEDFStream.ts        # Accumulating stream chunk buffer hook
│   ├── proto/
│   │   └── edf_stream.ts              # TS interfaces matching proto definitions
│   └── .env.local                     # Frontend env variables
│
├── SC4001E0-PSG.edf                   # Active physiological EDF file
└── aaaaamrj_s001_t000.edf             # Alternative EEG EDF file
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.12+ (with `venv` support)
- Node.js 18+ & npm

---

### 1. Setup Backend

Navigate to the `backend` folder, create and activate a virtual environment, and install dependencies:

```bash
cd backend

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

#### Configure Environment

Ensure your `backend/.env` points to the active EDF file:

```ini
PORT=8000
EDF_FILE_PATH=/Users/subhajithait/Documents/testing/grpc-test/SC4001E0-PSG.edf
```

#### Launch Backend Server

Run the FastAPI web server:

```bash
uvicorn main:app --reload --port 8000
```

_(Optional)_ To start the standalone gRPC server:

```bash
python grpc_server.py
```

---

### 2. Setup Frontend

Navigate to the `frontend` folder, install Node modules, and run the development server:

```bash
cd ../frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎛️ Data Processing Flow

1. **Mounting:** `useEDFMetadata` fetches metadata from the backend. The frontend initialises the selected channels and automatically queries the first `10 seconds` of the recording.
2. **Streaming:** The frontend initiates a connection to `/api/v1/edf/stream` passing parameters: `start_sample`, `window_samples`, and `channel_indices`.
3. **Chunking & Transfer:**
   - The backend reads slices of EDF data using MNE.
   - Subtracts cached DC baseline offset and applies scale multipliers (`V → µV`).
   - Serialises the raw `float32` array to raw bytes (`data_f32.tobytes()`).
   - Encodes the bytes as Base64 and yields the chunk via SSE.
4. **Decoding & Offsets:**
   - The frontend decodes the base64 string back into binary values using `atob`.
   - Reinterprets the binary buffer into standard floats:
     `const floats = new Float32Array(bytes.buffer);`
   - Maps each channel into stacked coordinates `{ x: timestamp, y: amplitude + channelOffset }`.
   - Passes the series to ApexCharts, which updates reactively.
