import {useState} from 'react'
import './App.css'
import VoiceRecorder from "./components/VoiceRecorder.tsx";

export default function App() {
    const [isLive, setLive] = useState(false);

    const handleLive = async () => {
        if (isLive) {
            setLive(false);
            console.log("stoped listening")


        } else {


            setLive(true);
            console.log("listening")
        }
    };
    return (
        <>
            <VoiceRecorder/>
            <button onClick={handleLive}>{isLive ? "Stop" : "Live"}</button>
        </>
    )
}