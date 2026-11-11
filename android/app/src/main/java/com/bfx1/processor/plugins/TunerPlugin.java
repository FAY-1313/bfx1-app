package com.bfx1.processor.plugins;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TunerNative")
public class TunerPlugin extends Plugin {

    private AudioRecord audioRecord;
    private Thread recordingThread;
    private volatile boolean isRecording = false;
    private static final int SAMPLE_RATE = 22050;
    private static final int BUFFER_SIZE = 2048;

    @PluginMethod
    public void start(PluginCall call) {
        if (isRecording) { call.resolve(); return; }

        // Check and request RECORD_AUDIO permission
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO}, 1001);
            call.reject("请允许麦克风权限后重试");
            return;
        }

        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufSize = Math.max(minBuf, BUFFER_SIZE * 2);

        try {
            audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, bufSize);

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                call.reject("AudioRecord init failed");
                return;
            }

            audioRecord.startRecording();
            isRecording = true;
            short[] buffer = new short[BUFFER_SIZE];
            float[] floatBuf = new float[BUFFER_SIZE];

            recordingThread = new Thread(() -> {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO);
                while (isRecording) {
                    int read = audioRecord.read(buffer, 0, BUFFER_SIZE);
                    if (read <= 0) continue;

                    for (int i = 0; i < read; i++) floatBuf[i] = buffer[i] / 32768f;

                    float rms = 0;
                    for (int i = 0; i < read; i++) rms += floatBuf[i] * floatBuf[i];
                    rms = (float) Math.sqrt(rms / read);
                    if (rms < 0.005f) continue;

                    float bestCorr = 0;
                    int bestLag = 0;
                    int maxLag = Math.min(read / 2, 1024);
                    for (int lag = 20; lag < maxLag; lag++) {
                        float sum = 0, r1 = 0, r2 = 0;
                        for (int i = 0; i < read - lag; i++) {
                            sum += floatBuf[i] * floatBuf[i + lag];
                            r1 += floatBuf[i] * floatBuf[i];
                            r2 += floatBuf[i + lag] * floatBuf[i + lag];
                        }
                        float corr = sum / (float) Math.sqrt(r1 * r2 > 0 ? r1 * r2 : 1);
                        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
                    }

                    if (bestLag > 0 && bestCorr > 0.4f) {
                        float freq = (float) SAMPLE_RATE / bestLag;
                        JSObject ret = new JSObject();
                        ret.put("frequency", freq);
                        ret.put("correlation", bestCorr);
                        notifyListeners("pitch", ret);
                    }
                }
            });
            recordingThread.start();
            call.resolve();
        } catch (Exception e) {
            call.reject("AudioRecord error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        isRecording = false;
        if (recordingThread != null) {
            recordingThread.interrupt();
            recordingThread = null;
        }
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch (Exception e) {}
            audioRecord = null;
        }
        call.resolve();
    }
}
