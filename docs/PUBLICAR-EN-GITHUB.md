# Publicar en GitHub sin exponer nada

Procedimiento para subir FarmaSys como proyecto de portafolio. Escrito después
de revisar este repositorio en concreto, no en general.

---

## Lo que se encontró al revisar

| | Estado |
|---|---|
| Secretos escritos en el código | **Ninguno** ✓ |
| `backend/.env` con secretos reales | Existe, pero `backend/.gitignore` lo cubre ✓ |
| `.env.example` | Solo textos de relleno ✓ |
| Token de SUNAT (`PSE_API_TOKEN`) | Vacío ✓ |
| `.gitignore` raíz | **No mencionaba `.env`** — corregido |
| Carpeta `.git` | **Existe, con historial de antes** ⚠ |

El único problema serio es el último, y tiene solución de una línea.

---

## 1. Empezar el historial de cero

**Este es el paso que de verdad protege.**

Git guarda *todo lo que alguna vez estuvo* en el repositorio. Borrar un archivo
hoy no lo saca del historial: sigue ahí, y cualquiera con el repo clonado lo
recupera con un comando. Este proyecto tuvo en su momento un `node_modules.rar`
de 60 MB commiteado, y no hay forma barata de saber qué más pasó por ahí.

Como no hay colaboradores, ni ramas, ni pull requests que conservar, lo sensato
es tirar el historial y empezar limpio:

```powershell
cd H:\sistema-botica

# 1. Saca el .rar de respaldo FUERA de la carpeta antes de nada
#    (muévelo a H:\respaldos\ o donde prefieras)

# 2. Borra el historial viejo
Remove-Item -Recurse -Force .git

# 3. Empieza de nuevo
git init
git branch -M main
git add .
```

**Antes de commitear, mira qué va a subir:**

```powershell
git status --short
```

Revisa la lista entera. Si aparece cualquier `.env`, cualquier `.rar`, o
`node_modules`, **para** y arregla el `.gitignore` antes de seguir.

Comprobación específica de lo que importa:

```powershell
git status --short | Select-String -Pattern "\.env|\.rar|\.zip|\.pfx|\.key|node_modules"
```

Si no devuelve nada, estás limpio.

```powershell
git commit -m "FarmaSys: sistema de gestion para cadena de boticas"
```

---

## 2. Rotar los secretos locales

Tu `backend/.env` tiene secretos JWT reales y `SEED_ADMIN_PASSWORD="Admin1234!"`.
No se van a subir, pero conviene tratarlos como quemados: han estado en tu disco
sin cifrar, en una carpeta que además estuvo dentro de un `.rar`.

Genera otros:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ejecútalo **dos veces** —uno para `JWT_ACCESS_SECRET` y otro distinto para
`JWT_REFRESH_SECRET`— y cambia también `SEED_ADMIN_PASSWORD` por algo que no sea
`Admin1234!`.

Cuando el cliente entre en producción, esos valores se generan otra vez y se
ponen solo en el servidor. Nunca los mismos que en tu máquina.

---

## 3. Crear el repositorio

En github.com → **New repository**:

- **Nombre**: `farmasys` (o `sistema-botica`)
- **Visibilidad**: pública si quieres que se vea en tu portafolio
- **NO marques** "Add a README" ni "Add .gitignore" — ya los tienes, y si los
  crea GitHub el primer `push` choca

```powershell
git remote add origin https://github.com/TU-USUARIO/farmasys.git
git push -u origin main
```

---

## 4. Asegurar la cuenta, no solo el repo

Que te "hackeen" por publicar código casi nunca pasa por el código. Pasa por la
cuenta. Tres cosas, en orden de importancia:

1. **Activa 2FA** en GitHub (Settings → Password and authentication). Es la
   diferencia entre "me robaron la contraseña" y "me robaron la cuenta". Con una
   app tipo Authy o Google Authenticator, no por SMS.
2. **Activa el escaneo de secretos**: Settings del repo → Code security →
   *Secret scanning* y *Push protection*. Push protection **bloquea el push** si
   detecta algo que parece una credencial. Es gratis en repos públicos.
3. **Revisa las apps autorizadas** en tu cuenta (Settings → Applications) y quita
   las que no reconozcas.

---

## 5. Qué es seguro que sea público

Que el código sea visible **no** es una vulnerabilidad. Lo que te expone es que
sean públicos los *secretos*, no la lógica.

| Público sin problema | Nunca público |
|---|---|
| El código de Angular y NestJS | `.env` con secretos reales |
| El `schema.prisma` completo | Contraseñas, aunque sean de prueba |
| La semilla de demostración | El `.pfx` de firma de SUNAT |
| `.env.example` con textos de relleno | Tokens de proveedores (Nubefact, Izipay) |
| Las capturas de pantalla | Datos reales de tu cliente |

Un detalle sobre lo último: la semilla de demostración usa boticas, RUC y
personas **inventadas**. Revísala antes de publicar y asegúrate de que no se
te ha colado ningún nombre, dirección o RUC del cliente real.

---

## 6. Si algo se te escapa

Si subes un secreto por error, el orden es este y no al revés:

1. **Rota el secreto primero.** Cambia la clave, revoca el token. Esto es lo
   urgente: mientras siga siendo válido, da igual lo que hagas con el repo.
2. **Después** limpia el repositorio (o bórralo y vuelve a crearlo).

Borrar el archivo y commitear encima **no sirve**: sigue en el historial. Y
GitHub indexa los repos públicos en segundos — hay bots que escanean commits
nuevos buscando credenciales justamente para eso.

---

## Lista final antes del push

- [ ] El `.rar` de respaldo está fuera de la carpeta del proyecto
- [ ] `.git` borrado y `git init` hecho de nuevo
- [ ] `git status --short` no muestra `.env`, `.rar` ni `node_modules`
- [ ] Secretos JWT y clave de admin rotados en tu `.env` local
- [ ] 2FA activado en tu cuenta de GitHub
- [ ] Push protection activado en el repositorio
- [ ] La semilla no tiene datos reales del cliente
- [ ] Le has avisado al cliente de que vas a publicar el proyecto (sin nombrarlo)
