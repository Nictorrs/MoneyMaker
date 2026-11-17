# Genera los íconos de Android/iOS y el logo de la app a partir de branding/moneymaker-logo.jpg.
# Uso (Windows PowerShell): powershell -ExecutionPolicy Bypass -File branding\generate-icons.ps1
# Las coordenadas del recorte corresponden a esa imagen de 2048 px; si cambias el logo, ajústalas.
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'moneymaker-logo.jpg'
$root = Split-Path $PSScriptRoot -Parent
$res = "$root\mobile\android\app\src\main\res"

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class MarkInfo { public Bitmap Mark; public double Radius; public int Opaque; }

public static class LogoTool
{
    const double Lo = 6, Hi = 34;
    static readonly Color GradientStart = Color.FromArgb(255, 255, 255);
    static readonly Color GradientEnd = Color.FromArgb(0xE9, 0xE6, 0xF8);

    static byte[] Bits(Bitmap bmp)
    {
        var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var buf = new byte[bmp.Width * 4 * bmp.Height];
        for (int y = 0; y < bmp.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), buf, y * bmp.Width * 4, bmp.Width * 4);
        bmp.UnlockBits(data);
        return buf;
    }

    static Bitmap FromBits(byte[] buf, int w, int h)
    {
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        for (int y = 0; y < h; y++) Marshal.Copy(buf, y * w * 4, IntPtr.Add(data.Scan0, y * data.Stride), w * 4);
        bmp.UnlockBits(data);
        return bmp;
    }

    static double Det(double[,] m)
    {
        return m[0, 0] * (m[1, 1] * m[2, 2] - m[1, 2] * m[2, 1])
             - m[0, 1] * (m[1, 0] * m[2, 2] - m[1, 2] * m[2, 0])
             + m[0, 2] * (m[1, 0] * m[2, 1] - m[1, 1] * m[2, 0]);
    }

    static double[] Solve(double[,] a, double[] b)
    {
        double d = Det(a);
        var x = new double[3];
        for (int col = 0; col < 3; col++)
        {
            var m = (double[,])a.Clone();
            for (int row = 0; row < 3; row++) m[row, col] = b[row];
            x[col] = Det(m) / d;
        }
        return x;
    }

    // Separates the symbol from the light gradient background: the background is modelled as a plane
    // fitted on the crop border, alpha comes from how much darker a pixel is than that plane, and the
    // colour is un-mixed so that compositing over a similar light background reproduces the original.
    public static MarkInfo ExtractMark(string src, int x0, int y0, int x1, int y1, int exclX, int exclY)
    {
        int W, H;
        byte[] px;
        using (var raw = new Bitmap(src))
        using (var full = new Bitmap(raw.Width, raw.Height, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(full)) g.DrawImage(raw, new Rectangle(0, 0, raw.Width, raw.Height));
            W = full.Width; H = full.Height;
            px = Bits(full);
        }

        var A = new double[3, 3];
        var B = new double[3][] { new double[3], new double[3], new double[3] };
        Action<int, int> sample = (x, y) =>
        {
            int i = (y * W + x) * 4;
            double[] v = { 1, x / 1000.0, y / 1000.0 };
            for (int r = 0; r < 3; r++)
            {
                for (int c = 0; c < 3; c++) A[r, c] += v[r] * v[c];
                for (int ch = 0; ch < 3; ch++) B[ch][r] += v[r] * px[i + ch];
            }
        };
        for (int y = y0; y < y0 + 10; y++) for (int x = x0; x < x1; x += 2) sample(x, y);
        for (int x = x0; x < x0 + 10; x++) for (int y = y0; y < y1; y += 2) sample(x, y);
        for (int y = y1 - 10; y < y1; y++) for (int x = x0; x < exclX; x += 2) sample(x, y);
        for (int x = x1 - 10; x < x1; x++) for (int y = y0; y < exclY; y += 2) sample(x, y);
        var coef = new double[3][];
        for (int ch = 0; ch < 3; ch++) coef[ch] = Solve(A, B[ch]);

        int cw = x1 - x0, chh = y1 - y0;
        var alpha = new double[cw * chh];
        var color = new double[cw * chh * 3];
        int minX = cw, minY = chh, maxX = -1, maxY = -1;
        for (int y = y0; y < y1; y++)
        {
            for (int x = x0; x < x1; x++)
            {
                int k = (y - y0) * cw + (x - x0);
                var bg = new double[3];
                for (int ch = 0; ch < 3; ch++) bg[ch] = coef[ch][0] + coef[ch][1] * x / 1000.0 + coef[ch][2] * y / 1000.0;
                double a = 0;
                int i = (y * W + x) * 4;
                if (!(x >= exclX && y >= exclY))
                {
                    double d = double.MinValue;
                    for (int ch = 0; ch < 3; ch++) d = Math.Max(d, bg[ch] - px[i + ch]);
                    a = Math.Max(0, Math.Min(1, (d - Lo) / (Hi - Lo)));
                    if (a < 0.12) a = 0;
                }
                alpha[k] = a;
                for (int ch = 0; ch < 3; ch++)
                {
                    double c = a > 0 ? (px[i + ch] - (1 - a) * bg[ch]) / a : bg[ch];
                    color[k * 3 + ch] = Math.Max(0, Math.Min(255, c));
                }
                if (a > 0)
                {
                    minX = Math.Min(minX, x - x0); maxX = Math.Max(maxX, x - x0);
                    minY = Math.Min(minY, y - y0); maxY = Math.Max(maxY, y - y0);
                }
            }
        }

        const int pad = 6;
        minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad);
        maxX = Math.Min(cw - 1, maxX + pad); maxY = Math.Min(chh - 1, maxY + pad);
        int tw = maxX - minX + 1, th = maxY - minY + 1;
        var outBuf = new byte[tw * th * 4];
        double cx = tw / 2.0, cy = th / 2.0, radius = 0;
        int opaque = 0;
        for (int y = 0; y < th; y++)
        {
            for (int x = 0; x < tw; x++)
            {
                int k = (y + minY) * cw + (x + minX);
                int o = (y * tw + x) * 4;
                for (int ch = 0; ch < 3; ch++) outBuf[o + ch] = (byte)Math.Round(color[k * 3 + ch]);
                outBuf[o + 3] = (byte)Math.Round(alpha[k] * 255);
                if (alpha[k] >= 0.5)
                {
                    radius = Math.Max(radius, Math.Sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)));
                    opaque++;
                }
            }
        }
        return new MarkInfo { Mark = FromBits(outBuf, tw, th), Radius = radius, Opaque = opaque };
    }

    public static Bitmap Monochrome(Bitmap mark)
    {
        var buf = Bits(mark);
        for (int o = 0; o < buf.Length; o += 4)
        {
            buf[o] = buf[o + 1] = buf[o + 2] = 255;
            buf[o + 3] = (byte)Math.Min(255, buf[o + 3] * 1.6);
        }
        return FromBits(buf, mark.Width, mark.Height);
    }

    static GraphicsPath RoundRect(RectangleF r, float rad)
    {
        var p = new GraphicsPath();
        float d = rad * 2;
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static Graphics Hq(Bitmap bmp)
    {
        var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.CompositingQuality = CompositingQuality.HighQuality;
        return g;
    }

    static void DrawMark(Graphics g, Bitmap mark, float cx, float cy, float scale)
    {
        float w = mark.Width * scale, h = mark.Height * scale;
        var dest = new[] { new PointF(cx - w / 2, cy - h / 2), new PointF(cx + w / 2, cy - h / 2), new PointF(cx - w / 2, cy + h / 2) };
        using (var attrs = new ImageAttributes())
        {
            attrs.SetWrapMode(WrapMode.TileFlipXY);
            g.DrawImage(mark, dest, new RectangleF(0, 0, mark.Width, mark.Height), GraphicsUnit.Pixel, attrs);
        }
    }

    // shape: 0 = transparent, 1 = full square, 2 = rounded square, 3 = circle.
    public static void Render(Bitmap mark, double markRadius, string path, int size, int shape, float inset, float corner, float targetRadius, bool opaque)
    {
        using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (var g = Hq(bmp))
            {
                g.Clear(Color.Transparent);
                var rect = new RectangleF(inset, inset, size - 2 * inset, size - 2 * inset);
                if (shape > 0)
                {
                    using (var brush = new LinearGradientBrush(new PointF(rect.Left - 1, rect.Top - 1), new PointF(rect.Right + 1, rect.Bottom + 1), GradientStart, GradientEnd))
                    {
                        if (shape == 1) g.FillRectangle(brush, rect);
                        else if (shape == 2) using (var p = RoundRect(rect, corner)) g.FillPath(brush, p);
                        else g.FillEllipse(brush, rect);
                    }
                }
                if (targetRadius > 0) DrawMark(g, mark, size / 2f, size / 2f, (float)(targetRadius / markRadius));
            }
            if (opaque)
            {
                using (var flat = new Bitmap(size, size, PixelFormat.Format24bppRgb))
                {
                    using (var g = Graphics.FromImage(flat)) { g.Clear(GradientEnd); g.DrawImageUnscaled(bmp, 0, 0); }
                    flat.Save(path, ImageFormat.Png);
                }
            }
            else bmp.Save(path, ImageFormat.Png);
        }
    }

    public static void SaveScaled(Bitmap mark, string path, int width)
    {
        int height = (int)Math.Round(mark.Height * (double)width / mark.Width);
        using (var bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb))
        {
            using (var g = Hq(bmp)) { g.Clear(Color.Transparent); DrawMark(g, mark, width / 2f, height / 2f, (float)width / mark.Width); }
            bmp.Save(path, ImageFormat.Png);
        }
    }

    // Simulates what a launcher shows: background + foreground layers clipped by a circle and a squircle-ish mask.
    public static void PreviewAdaptive(string bgPath, string fgPath, string outPath, int canvas)
    {
        using (var bg = new Bitmap(bgPath))
        using (var fg = new Bitmap(fgPath))
        using (var bmp = new Bitmap(canvas * 2 + 60, canvas + 40, PixelFormat.Format32bppArgb))
        using (var g = Hq(bmp))
        {
            g.Clear(Color.FromArgb(0x1B, 0x16, 0x35));
            int visible = (int)(bg.Width * 72.0 / 108.0);
            float offset = (bg.Width - visible) / 2f;
            float scale = (float)canvas / visible;
            for (int n = 0; n < 2; n++)
            {
                var dest = new RectangleF(20 + n * (canvas + 20), 20, canvas, canvas);
                using (var clip = n == 0 ? new GraphicsPath() : RoundRect(dest, canvas * 0.24f))
                {
                    if (n == 0) clip.AddEllipse(dest);
                    g.SetClip(clip);
                    var layer = new RectangleF(dest.Left - offset * scale, dest.Top - offset * scale, bg.Width * scale, bg.Height * scale);
                    g.DrawImage(bg, layer);
                    g.DrawImage(fg, layer);
                    g.ResetClip();
                }
            }
            bmp.Save(outPath, ImageFormat.Png);
        }
    }
}
'@

# Símbolo del logo en la imagen original (2048 px): el texto "MoneyMaker" empieza en x≈714, y≈1001; la flecha baja hasta y≈980 en x=695.
$info = [LogoTool]::ExtractMark($source, 170, 690, 880, 1290, 695, 990)
"mark {0}x{1}, radius {2:N1}, opaque px {3}" -f $info.Mark.Width, $info.Mark.Height, $info.Radius, $info.Opaque
$mono = [LogoTool]::Monochrome($info.Mark)

New-Item -ItemType Directory -Force "$root\mobile\assets\brand" | Out-Null
$info.Mark.Save("$root\branding\moneymaker-mark.png", [System.Drawing.Imaging.ImageFormat]::Png)
[LogoTool]::SaveScaled($info.Mark, "$root\mobile\assets\brand\logo-mark.png", 360)

$densities = [ordered]@{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }
foreach ($name in $densities.Keys) {
  $s = $densities[$name]
  $dir = "$res\mipmap-$name"
  $adaptive = [int](108 * $s)
  $legacy = [int](48 * $s)
  [LogoTool]::Render($info.Mark, $info.Radius, "$dir\ic_launcher_background.png", $adaptive, 1, 0, 0, 0, $false)
  [LogoTool]::Render($info.Mark, $info.Radius, "$dir\ic_launcher_foreground.png", $adaptive, 0, 0, 0, 32.5 * $s, $false)
  [LogoTool]::Render($mono, $info.Radius, "$dir\ic_launcher_monochrome.png", $adaptive, 0, 0, 0, 32.5 * $s, $false)
  [LogoTool]::Render($info.Mark, $info.Radius, "$dir\ic_launcher.png", $legacy, 2, 2 * $s, 10 * $s, 17 * $s, $false)
  [LogoTool]::Render($info.Mark, $info.Radius, "$dir\ic_launcher_round.png", $legacy, 3, 2 * $s, 0, 16 * $s, $false)
}

[LogoTool]::Render($info.Mark, $info.Radius, "$root\mobile\android\app\src\main\ic_launcher-playstore.png", 512, 1, 0, 0, 200, $true)
[LogoTool]::Render($info.Mark, $info.Radius, "$root\mobile\ios\MoneyMaker\Images.xcassets\AppIcon.appiconset\AppIcon-1024.png", 1024, 1, 0, 0, 400, $true)

[LogoTool]::PreviewAdaptive("$res\mipmap-xxxhdpi\ic_launcher_background.png", "$res\mipmap-xxxhdpi\ic_launcher_foreground.png", "$env:TEMP\moneymaker-icon-preview.png", 288)
$info.Mark.Dispose(); $mono.Dispose()
"done"


