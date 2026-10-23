# Besprechungsprotokoll – App für iPad und iPhone

Mit dieser App schreibst du Besprechungen live mit: Kritikpunkte, Notizen, Beschlüsse, Verantwortliche und Fristen. Sie läuft offline. Mit Anmeldung über Microsoft 365 hast du auf iPhone und iPad denselben Stand.

- **Code:** `index.html`, `manifest.json`, `sw.js`, `icon-*.png`. Der Code darf öffentlich sein, er enthält keine Daten.
- **Daten:** auf dem Gerät und, mit Anmeldung, in **deinem OneDrive** unter `Apps/Besprechungsprotokoll`. Sie liegen niemals auf GitHub.
- **Tests:** `node tests/app.test.mjs`, nur mit frei erfundenen Testdaten.

## 1. Online stellen (GitHub Pages, kostenlos)

Dieses Repository ist öffentlich und enthält nur die App. **Firmeninternes gehört nicht hierher.**

1. Das Repository ist bereits öffentlich. Beim kostenlosen Konto geht Pages nur so.
2. **Settings → Pages**: Bei *Source* „Deploy from a branch“ wählen, dann Branch `main` und Ordner `/ (root)` → **Save**.
3. Nach 1 bis 10 Minuten läuft die App unter **https://caravantirge.github.io/Protokoll/**.

Netlify Drop eignet sich nicht: Seiten, die ohne Konto hochgeladen werden, löscht Netlify wieder.

## 2. Bei Microsoft registrieren (einmalig, ca. 10 Minuten)

Dafür brauchst du die Rolle *Anwendungsadministrator* oder *Cloudanwendungsadministrator*. Alternativ reicht es, wenn bei euch normale Benutzer Apps registrieren dürfen.

1. **entra.microsoft.com** öffnen → **Anwendungen → App-Registrierungen → Neue Registrierung**.
2. Name: `Besprechungsprotokoll`.
   Unterstützte Kontotypen: **„Nur Konten in diesem Organisationsverzeichnis“**.
   Umleitungs-URI: Plattform **„Single-Page-Anwendung (SPA)“**, Adresse **`https://caravantirge.github.io/Protokoll/`**.
   → **Registrieren**.
3. Auf der Übersichtsseite notieren:
   - **Anwendungs-ID (Client)**
   - **Verzeichnis-ID (Mandant)**
4. **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**: `Files.ReadWrite` und `offline_access` auswählen. `User.Read` ist schon da. → **Berechtigungen hinzufügen**.
5. Optional: **„Administratorzustimmung für … erteilen“**. Dann fragt Microsoft bei der Anmeldung nicht nach.

Die beiden Kennungen sind keine Geheimnisse. Du kannst sie Claude geben, dann werden sie fest in die App eingetragen. Alternativ gibst du sie einmal pro Gerät in der App ein.

## 3. Aufs iPad und iPhone

1. Die Adresse in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**. Den Schalter „Als Web-App öffnen“ eingeschaltet lassen.
2. Die App **nur noch über das Home-Bildschirm-Symbol** öffnen. Sie hat einen eigenen Speicher, getrennt von Safari.
3. **„…“ → iPhone & iPad abgleichen** → (Kennungen eintragen) → **Mit Microsoft anmelden**.
4. Auf dem zweiten Gerät genauso. Danach haben beide denselben Stand.
5. Offline testen: Unter „…“ sollte bei „Offline nutzbar“ „Ja“ stehen. Dann den Flugmodus einschalten, die App schließen und wieder öffnen.

So funktioniert der Abgleich:
- Beim Öffnen, nach Änderungen und jede Minute wird abgeglichen.
- Ohne Netz, etwa im Restaurant, arbeitest du normal weiter. Abgeglichen wird, sobald wieder Verbindung besteht.
- Ändern beide Geräte gleichzeitig verschiedene Punkte, bleibt beides erhalten. Am selben Punkt gewinnt die zuletzt gespeicherte Änderung.
- Die Anmeldung muss etwa einmal am Tag mit einem Tipp erneuert werden. Das ist eine Microsoft-Regel für Web-Apps.

## 4. So arbeitest du damit

- **Themenliste:** Alle Themen auf einen Blick. Der Kreis vorn markiert „besprochen“, rechts steht der Status (In Bearbeitung / Erledigt), darunter Verantwortlicher, Frist und Fortschritt der Unterpunkte. Filtern nach Status, Person oder Kategorie.
- **Thema antippen:** Text, Vorschlag, Status (Offen · In Bearbeitung · Erledigt), verantwortliche Person, Frist und **Unterpunkte** – jede Zeile einzeln, mit „+“ oder Enter kommt die nächste. Mit den Pfeilen oben oder durch Wischen geht es zum nächsten Thema.
- **Personen:** Einmal unter „…“ → *Besprechung & Personen* anlegen, am besten mit E-Mail-Adresse.
- **Export (Teilen-Symbol):** Auswahl „Alle / Nicht erledigt / Erledigt“ und eine Person → PDF, E-Mail, Text oder Excel. Unter „E-Mail an jeden Verantwortlichen“ bekommt jede Person mit einem Tipp nur ihre Themen, mit Unterpunkten zum Abhaken.

## 5. Liste importieren

„…“ → **Liste importieren**: Liste einfügen, Vorschau prüfen, oben rechts auf „… übernehmen“ tippen. Erkanntes Format:

```
1. Kritik: …
Lösung: … Offen: …
2. Kritik: …
Lösung: …
```

Optional kann jeder Punkt diese Zeilen haben: `Kategorie: …`, `Herkunft: Werkstatt/GF`, `Priorität: hoch/mittel/niedrig`.

## 6. Sichern

- Mit Anmeldung liegt alles in deinem OneDrive. Ältere Besprechungen findest du im Ordner `Archiv`.
- Zusätzlich gibt es jederzeit Teilen-Symbol → **Backup sichern …** → „In Dateien sichern“.
- **Achtung ohne Anmeldung:** Liegen die Daten nur auf dem Gerät, sind sie weg, wenn du in Safari „Verlauf und Websitedaten löschen“ ausführst oder die App vom Home-Bildschirm löschst.
