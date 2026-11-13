using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class GlobalKeyHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookId = IntPtr.Zero;

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static string GetKeyName(int vkCode) {
        // Digits 0-9
        if (vkCode >= 0x30 && vkCode <= 0x39) {
            return ((char)vkCode).ToString();
        }
        // Letters A-Z
        if (vkCode >= 0x41 && vkCode <= 0x5A) {
            return ((char)vkCode).ToString();
        }
        // Function keys F1-F24
        if (vkCode >= 0x70 && vkCode <= 0x87) {
            return "F" + (vkCode - 0x70 + 1);
        }
        // Numpad 0-9
        if (vkCode >= 0x60 && vkCode <= 0x69) {
            return "Num" + (vkCode - 0x60);
        }

        switch (vkCode) {
            case 0x20: return "Space";
            case 0x0D: return "Enter";
            case 0x1B: return "Escape";
            case 0x08: return "Backspace";
            case 0x09: return "Tab";
            case 0x2E: return "Delete";
            case 0x2D: return "Insert";
            case 0x24: return "Home";
            case 0x23: return "End";
            case 0x21: return "PageUp";
            case 0x22: return "PageDown";
            case 0x25: return "Left";
            case 0x26: return "Up";
            case 0x27: return "Right";
            case 0x28: return "Down";
            case 0x6A: return "NumMult";
            case 0x6B: return "NumAdd";
            case 0x6D: return "NumSub";
            case 0x6E: return "NumDec";
            case 0x6F: return "NumDiv";
            case 0x14: return "CapsLock";
            case 0x90: return "NumLock";
            case 0x91: return "ScrollLock";
            case 0x2C: return "PrintScreen";
            case 0x13: return "Pause";
            case 0xBA: return ";";
            case 0xBB: return "=";
            case 0xBC: return ",";
            case 0xBD: return "-";
            case 0xBE: return ".";
            case 0xBF: return "/";
            case 0xC0: return "`";
            case 0xDB: return "[";
            case 0xDC: return "\\";
            case 0xDD: return "]";
            case 0xDE: return "'";
            default: return null;
        }
    }

    private static void SafeWriteLine(string text) {
        try {
            Console.WriteLine(text);
            Console.Out.Flush();
        } catch {
            // Silently ignore if pipe was closed
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            bool isDown = (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN);
            bool isUp = (wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP);

            if (isDown || isUp) {
                try {
                    KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                    int vk = hookStruct.vkCode;

                    // Handle modifier releases explicitly so chords never get stuck
                    if (isUp) {
                        if (vk == 0x11 || vk == 0xA2 || vk == 0xA3) {
                            SafeWriteLine("KEY_UP:Ctrl");
                        } else if (vk == 0x12 || vk == 0xA4 || vk == 0xA5) {
                            SafeWriteLine("KEY_UP:Alt");
                        } else if (vk == 0x10 || vk == 0xA0 || vk == 0xA1) {
                            SafeWriteLine("KEY_UP:Shift");
                        } else if (vk == 0x5B || vk == 0x5C) {
                            SafeWriteLine("KEY_UP:Win");
                        }
                    }

                    // Ignore pure modifier presses alone
                    if (vk != 0x10 && vk != 0x11 && vk != 0x12 && vk != 0x5B && vk != 0x5C &&
                        vk != 0xA0 && vk != 0xA1 && vk != 0xA2 && vk != 0xA3 && vk != 0xA4 && vk != 0xA5) {
                        
                        string key = GetKeyName(vk);
                        if (key != null) {
                            // Use GetAsyncKeyState for real-time physical key states across all applications/games
                            bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
                            bool alt = (GetAsyncKeyState(0x12) & 0x8000) != 0;
                            bool shift = (GetAsyncKeyState(0x10) & 0x8000) != 0;
                            bool win = (GetAsyncKeyState(0x5B) & 0x8000) != 0 || (GetAsyncKeyState(0x5C) & 0x8000) != 0;

                            StringBuilder sb = new StringBuilder();
                            if (ctrl) sb.Append("Ctrl+");
                            if (alt) sb.Append("Alt+");
                            if (shift) sb.Append("Shift+");
                            if (win) sb.Append("Win+");
                            sb.Append(key);

                            string fullKey = sb.ToString();
                            if (isDown) {
                                SafeWriteLine("KEY_DOWN:" + fullKey);
                            } else {
                                SafeWriteLine("KEY_UP:" + fullKey);
                                if (fullKey != key) {
                                    SafeWriteLine("KEY_UP:" + key);
                                }
                            }
                        }
                    }
                } catch {
                    // Prevent any exception from terminating the low-level hook thread
                }
            }
        }
        // ALWAYS pass the event to the next hook and window so typing is NEVER blocked!
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    public static void Main(string[] args) {
        try {
            Console.OutputEncoding = Encoding.UTF8;
        } catch {
            // Safe fallback if console handle is redirected without a console attached
        }

        try {
            _hookId = SetHook(_proc);
            SafeWriteLine("READY");
        } catch (Exception ex) {
            try {
                Console.Error.WriteLine("Error initializing hook: " + ex.Message);
            } catch {}
            return;
        }

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        if (_hookId != IntPtr.Zero) {
            UnhookWindowsHookEx(_hookId);
        }
    }
}
