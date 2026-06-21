# 📻 Logbook POTA Autónomo para Raspberry Pi & Docker

Este es un sistema de gestión de guardado de contactos (QSOs) en tiempo real especialmente optimizado para actividades de radioafición como **POTA (Parks on the Air)**, **SOTA**, **IOTA** o **BOTA**. El software levanta un servidor web autónomo que permite registrar contactos, publicar anuncios, monitorizar un feed en vivo y ofrecer descargas automáticas de tarjetas QSL en formato PDF para los cazadores.

### 🌟 Características Principales
* **Multiplataforma:** Diseñado para correr de forma nativa en Raspberry Pi, servidores NAS Synology (Docker) o Linux.
* **Feed en Vivo:** Los cazadores pueden ver tus transmisiones actualizadas en tiempo real cada 3 segundos.
* **Tablón de Avisos:** Muestra de forma inteligente los 3 últimos anuncios críticos del operador (cambios de frecuencia, QRT, etc.).
* **Generación de QSL:** Descarga instantánea de la tarjeta QSL oficial personalizada en formato PDF para el corresponsal verificado.
* **Análisis Avanzado:** Gráficos y tablas compactas con el desglose ordenado de bandas, modos, distritos de la URE y países DX (mapeo mundial por prefijos ITU).
* **Exportación Estándar:** Descarga de logs en formatos nativos ADIF (.adi), CSV e informes analíticos listos en PDF.
### 📂 Estructura del Proyecto
El repositorio debe mantener la siguiente organización de archivos para su correcto funcionamiento:
```text
logbook-pota/
├── data/                      <-- Almacenamiento persistente de SQLite y QSLs
├── public_admin/
│   └── resumen.html           <-- Panel de control del administrador (operador)
├── public_user/
│   └── index.html             <-- Interfaz pública para cazadores (corresponsales)
├── package.json               <-- Gestión de dependencias de Node.js
└── server.js                  <-- Servidor Backend unificado
```

### 🛠️ Requisitos de la Raspberry Pi
* **Hardware:** Raspberry Pi 3, 4 o 5.
* **Sistema Operativo:** Raspberry Pi OS de 64 bits (versión *Lite* o *Desktop*).
* **Red:** Conexión local a internet (Ethernet o WiFi).
## 🚀 Guía de Instalación Rápida en Raspberry Pi

Sigue estos pasos en la terminal de comandos de tu Raspberry Pi para poner en marcha tu servidor de radio en menos de 5 minutos.

### Paso 1: Actualizar el Sistema e Instalar Node.js
Abre la terminal SSH de tu Raspberry Pi y ejecuta los siguientes comandos para preparar el entorno:

```bash
# Actualizar los paquetes del sistema operativo
sudo apt update && sudo apt upgrade -y

# Descargar e instalar Node.js versión 20 LTS
curl -fsSL https://nodesource.com | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar las herramientas esenciales para compilar la base de datos local
sudo apt-get install -y build-essential
```
### Paso 2: Clonar el Repositorio de GitHub
Descarga de forma directa todo el código corregido y estructurado de este repositorio ejecutando la siguiente línea de comandos:

```bash
# Clonar el proyecto en tu carpeta de usuario
cd ~
git clone https://github.com

# Entrar en el directorio del proyecto
cd logbook-pota
```
*(Recuerda sustituir `TU_USUARIO_GITHUB` por tu nombre de usuario real en GitHub).*
### Paso 3: Instalar Dependencias de Radio
Manda a compilar de manera nativa los binarios de SQLite3, Sharp, Express y PDFKit para la arquitectura de procesador ARM de tu Raspberry Pi:

```bash
npm install
```
*(Este paso puede tardar entre 1 y 2 minutos dependiendo del modelo de tu Raspberry Pi, ya que realiza optimizaciones internas de las librerías nativas).*
### Paso 4: Arrancar el Servidor
Para iniciar la aplicación por primera vez en tu red local, ejecuta el siguiente comando:

```bash
npm start
```

Una vez que la consola muestre el mensaje `Servidor POTA listo en el puerto 3000`, la aplicación estará operativa. Abre el navegador web de cualquier dispositivo de tu casa e introduce:
* **Panel de Control (Operador):** `http://IP_DE_TU_RASPBERRY:3000/admin/resumen.html`
* **Visor Público (Cazadores):** `http://IP_DE_TU_RASPBERRY:3000/`

*(Para averiguar la IP local de tu Raspberry Pi puedes escribir el comando `hostname -I` en la terminal).*
## 🔄 Automatización: Arranque Automático en Segundo Plano

Para evitar tener la terminal abierta constantemente y garantizar que el logbook de radio se encienda de forma automática cada vez que conectes tu Raspberry Pi a la corriente, se recomienda usar el gestor de procesos **PM2**.

Instálalo y configúralo ejecutando las siguientes líneas en la consola:

```bash
# Instalar PM2 de forma global en el sistema
sudo npm install -g pm2

# Iniciar tu servidor de radio bajo el control de PM2
pm2 start server.js --name "logbook-pota"

# Guardar el estado actual del proceso
pm2 save

# Generar el script de inicio automatico para Linux
pm2 startup
```
*(Al ejecutar el último comando, la terminal te mostrará una línea de código larga que deberás copiar, pegar y pulsar Enter para dar los permisos de arranque definitivos).*
## 📻 Operación Práctica: Uso en el Campo (Activaciones)

Gracias a la arquitectura distribuida del software, puedes dejar tu Raspberry Pi encendida en el cuarto de radio de tu casa (o tu Docker en Synology) y operar de forma 100% remota desde el coche o la montaña con tu teléfono móvil:

1. Asegúrate de tener los puertos de tu router redirigidos (mapeo del puerto `3000` hacia la IP de tu Raspberry Pi o NAS).
2. Cuando estés en el monte, abre el navegador de tu smartphone con tu conexión de datos 4G/5G.
3. Introduce tu dirección IP pública de casa o tu dominio DDNS (ej: `http://ddns.net`).
4. **¡Listo!** Registra tus QSOs en tiempo real. La base de datos guardará los contactos a salvo en el disco duro de tu casa.
## 👥 Operación Multioperador (Sin Conflictos)

Si estás realizando una activación con un compañero o un anotador, podéis registrar contactos en la misma actividad simultáneamente de forma segura:
* **Operador Principal:** Registra contactos desde la ventana nativa de la aplicación o el navegador.
* **Segundo Operador / Anotador:** No necesita instalar nada. Abre el navegador web de su teléfono o tablet, entra a la dirección IP del servidor central y accede al panel de administración. El backend de Node.js se encargará de gestionar de forma asíncrona la base de datos SQLite sin bloqueos ni colisiones.
## 🎯 Comandos de Mantenimiento Útiles

A continuación tienes una lista de comandos rápidos para gestionar tu servidor a través de PM2:

```bash
# Ver el estado del servidor en vivo y consumo de memoria
pm2 status

# Ver los registros y logs en tiempo real (QSOs entrantes, errores)
pm2 logs logbook-pota

# Reiniciar el servidor de radio
pm2 restart logbook-pota

# Detener el servidor temporalmente
pm2 stop logbook-pota
```

---
¡Disfruta de tus activaciones, 73 de tu software de Logbook POTA Autónomo!
