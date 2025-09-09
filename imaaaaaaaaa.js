import React, { useState, useEffect } from "react";

const steps = [
  { bottom: 0, left: 0 },
  { bottom: 40, left: 40 },
  { bottom: 80, left: 80 },
  { bottom: 120, left: 120 },
  { bottom: 160, left: 160 },
  { bottom: 200, left: 200 },
  { bottom: 240, left: 240 },
];

const emojis = ["🏃‍♂", "💪", "🤸‍♀", "🏋‍♂", "🧘‍♂"];

export default function PushUpClimb() {
  const [pushupCount, setPushupCount] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [toast, setToast] = useState("");
  const [character, setCharacter] = useState(emojis[0]);

  const pushUpsPerStep = 5;
  const maxStep = steps.length - 1;
  const dailyGoal = 50;

  useEffect(() => {
    const targetStep = Math.min(Math.floor(pushupCount / pushUpsPerStep), maxStep);
    if (targetStep !== currentStep) {
      setCurrentStep(targetStep);
      if (targetStep === maxStep) {
        showToast("🎉 You reached the top! Amazing work!");
      } else {
        showToast(Step up! You are now at step ${targetStep + 1});
      }
    }
  }, [pushupCount]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const handlePushUp = () => {
    if (pushupCount < dailyGoal) {
      setPushupCount(pushupCount + 5);
    } else {
      showToast("🎯 Daily goal reached! Great job!");
    }
  };

  const handleReset = () => {
    setPushupCount(0);
    setCurrentStep(0);
    showToast("Progress reset! Let's go again!");
  };

  const progressToNextStep = ((pushupCount % pushUpsPerStep) / pushUpsPerStep) * 100;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>FitVibe Push-Up Climb</h1>

      <div style={styles.stairsContainer}>
        {/* Stair steps */}
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              ...styles.step,
              bottom: step.bottom,
              left: step.left,
              backgroundColor: i <= currentStep ? "#4CAF50" : "#004d40",
              boxShadow: i === currentStep ? "0 0 15px #81C784" : "none",
              transition: "background-color 0.5s ease, box-shadow 0.5s ease",
            }}
          />
        ))}

        {/* Character */}
        <div
          style={{
            ...styles.character,
            bottom: steps[currentStep].bottom,
            left: steps[currentStep].left,
            animation: "bounce 1.5s infinite",
          }}
          role="img"
          aria-label="Character"
        >
          {character}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressBarContainer}>
        <div style={{ ...styles.progressBarFill, width: ${progressToNextStep}% }} />
      </div>
      <p style={{ color: "#004d40", fontWeight: "600" }}>
        {pushupCount} / {dailyGoal} push-ups done today
      </p>

      {/* Buttons */}
      <div style={styles.buttonsContainer}>
        <button style={styles.button} onClick={handlePushUp}>
          Complete 5 Push-ups
        </button>

        <button style={styles.button} onClick={handleReset}>
          Reset Progress
        </button>
      </div>

      {/* Character Selector */}
      <div style={{ marginTop: 20 }}>
        <p style={{ color: "#004d40" }}>Choose your character:</p>
        <div style={{ display: "flex", gap: 15 }}>
          {emojis.map((emo, idx) => (
            <button
              key={idx}
              onClick={() => setCharacter(emo)}
              style={{
                fontSize: 30,
                cursor: "pointer",
                border: character === emo ? "2px solid #4CAF50" : "none",
                background: "none",
              }}
              aria-label={Select character ${emo}}
            >
              {emo}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: "#e0f7fa",
    minHeight: "100vh",
    padding: 30,
    textAlign: "center",
  },
  title: {
    color: "#004d40",
    marginBottom: 40,
    fontSize: 36,
  },
  stairsContainer: {
    position: "relative",
    width: 280,
    height: 300,
    margin: "0 auto",
    borderLeft: "5px solid #00796b",
    borderBottom: "5px solid #00796b",
  },
  step: {
    width: 40,
    height: 40,
    position: "absolute",
    borderRadius: 6,
  },
  character: {
    position: "absolute",
    fontSize: 48,
    userSelect: "none",
    cursor: "default",
  },
  progressBarContainer: {
    width: 280,
    height: 15,
    backgroundColor: "#b2dfdb",
    borderRadius: 10,
    marginTop: 25,
    overflow: "hidden",
    marginLeft: "auto",
    marginRight: "auto",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4caf50",
    borderRadius: 10,
    transition: "width 0.5s ease",
  },
  buttonsContainer: {
    marginTop: 30,
    display: "flex",
    justifyContent: "center",
    gap: 15,
  },
  button: {
    backgroundColor: "#00796b",
    color: "#fff",
    border: "none",
    padding: "15px 25px",
    borderRadius: 8,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,121,107,0.6)",
    transition: "background-color 0.3s ease",
  },
  toast: {
    position: "fixed",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#004d40",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: 25,
    boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
    fontWeight: "600",
    zIndex: 1000,
  },
};