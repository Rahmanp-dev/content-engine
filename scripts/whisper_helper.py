"""
Whisper transcription helper script.
Usage: python whisper_helper.py <input_video> <output_txt> [model]
"""
import sys
import json
import whisper

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: whisper_helper.py <input> <output> [model]"}))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else "small"
    
    try:
        model = whisper.load_model(model_name)
        result = model.transcribe(input_path, fp16=False, language="en")
        text = result.get("text", "").strip()
        
        # Write transcript to output file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(text)
        
        # Print result as JSON to stdout
        segments = result.get("segments", [])
        duration = segments[-1]["end"] if segments else 0
        word_count = len(text.split())
        
        print(json.dumps({
            "text": text,
            "duration": round(duration, 1),
            "words": word_count
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
