# Backend Setup

This repository is a draft FastAPI backend setup intended to be used as a reusable template.

## Setup

1. Create a virtual environment:

```bash
python -m venv .venv
```

2. Activate the virtual environment:

```bash
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Run the app

Start the FastAPI server with Uvicorn:

```bash
uvicorn main:app --reload
```

> If your FastAPI app is located in a different module, update `main:app` accordingly.

## Notes

- Use `.venv` for isolation and ensure all commands run inside the activated environment.
- For production deployments, replace `--reload` with a production-ready configuration.
