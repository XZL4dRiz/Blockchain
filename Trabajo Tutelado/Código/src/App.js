import React, { useEffect, useState } from "react";
import './App.css';
import { create } from 'kubo-rpc-client';
import { ethers } from "ethers";
import { Buffer } from "buffer";
import logo from "./logo.png";
import { addresses, abis } from "./contracts/src/";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ART_NFT_ADDRESS = addresses.ArtNFT;
const MARKETPLACE_ADDRESS = addresses.Marketplace;

function getArtNFTContract(signerOrProvider) {
  return new ethers.Contract(ART_NFT_ADDRESS, abis.ArtNFT, signerOrProvider || getProvider());
}

window.getArtNFTContract = getArtNFTContract;
window.getSigner = getSigner;
window.getAccountAddress = getAccountAddress;

function getMarketplaceContract(signerOrProvider) {
  return new ethers.Contract(MARKETPLACE_ADDRESS, abis.Marketplace, signerOrProvider || getProvider());
}



// Helpers
function getProvider() {
  return new ethers.providers.Web3Provider(window.ethereum);
}
function getSigner() {
  return getProvider().getSigner();
}
async function getAccountAddress() {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts.length ? accounts[0] : null;
}

function getIpfsContract(signerOrProvider) {
  return new ethers.Contract(addresses.ipfs, abis.ipfs, signerOrProvider || getProvider());
}

// Lee user file en contrato IPFS
async function readCurrentUserFile() {
  const addr = await getAccountAddress();
  if (!addr) return ZERO_ADDRESS;
  const ipfsC = getIpfsContract(getProvider());
  return await ipfsC.userFiles(addr);
}

function App() {

  const [activeTab, setActiveTab] = useState("marketplace");

  // Wallet
  const [account, setAccount] = useState(null);
  const [connected, setConnected] = useState(false);

  // IPFS states
  const [ipfsHash, setIpfsHash] = useState("");
  const [musicFile, setMusicFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadedCid, setUploadedCid] = useState("");
  const [fileType, setFileType] = useState("");

  // Metadata states
  const [metadata, setMetadata] = useState({
    title: "",
    genre: "",
    instruments: "",
    bpm: ""
  });
  const [metadataCid, setMetadataCid] = useState("");

  // === Estados para NFTs ===
  const [userNFTs, setUserNFTs] = useState([]);          // NFTs del usuario conectado
  const [marketplaceItems, setMarketplaceItems] = useState([]);  // NFTs listados en el marketplace

  const [showListModal, setShowListModal] = useState(false);
  const [nftToList, setNftToList] = useState(null);
  const [listPrice, setListPrice] = useState("");

  const [myListings, setMyListings] = useState([]);

  const [showBuyModal, setShowBuyModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);

  const [activityFeed, setActivityFeed] = useState([]);

  const [nowPlaying, setNowPlaying] = useState(null);   // metadata del nft actual
  const [audioUrl, setAudioUrl] = useState(null);       // URL IPFS reproducible

  // connect wallet
  async function connectWallet() {
    try {
      const addr = await getAccountAddress();
      if (!addr) return;
      setAccount(addr);
      setConnected(true);

      const userFile = await readCurrentUserFile();
      if (userFile && userFile !== ZERO_ADDRESS) setIpfsHash(userFile);
    } catch (err) {
      console.error(err);
    }
  }

  function disconnectWallet() {
    setConnected(false);
    setAccount(null);
  }

  function playNFT(nft) {
    if (!nft.metadata?.audio) {
      alert("El NFT no tiene archivo de audio");
      return;
    }

    const url = nft.metadata.audio.replace("ipfs://", "http://127.0.0.1:8080/ipfs/");

    setAudioUrl(url);
    setNowPlaying({
      title: nft.metadata.title,
      image: nft.metadata.image?.replace("ipfs://", "https://ipfs.io/ipfs/"),
      bpm: nft.metadata.bpm,
      genre: nft.metadata.genre
    });
  }

  // Guarda en contrato IPFS (NO lo usamos todavía)
  async function setFileIPFS(hash) {
    const ipfsC = getIpfsContract(getSigner());
    const tx = await ipfsC.setFileIPFS(hash);
    await tx.wait();
    setIpfsHash(hash);
  }

  // Selección de archivo
  const selectMusicFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMusicFile(file);
    setFileType(file.type);
    setUploadedCid("");

    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);
  };

  // Subida archivo IPFS
  const uploadMusicFile = async () => {
    if (!musicFile) {
      alert("Selecciona un archivo primero");
      return;
    }

    try {
      const client = await create('/ip4/127.0.0.1/tcp/5001');

      const arrayBuffer = await musicFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await client.add(buffer);
      const cid = result.cid.toString();
      setUploadedCid(cid);

      alert("Archivo subido correctamente a IPFS");

    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // metadata handlers
  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata(prev => ({ ...prev, [name]: value }));
  };

  // Subida metadata JSON IPFS
  const uploadMetadata = async () => {
    if (!uploadedCid) {
      alert("Sube un archivo primero");
      return;
    }
    if (!metadata.title || !metadata.genre) {
      alert("Rellena título y género");
      return;
    }

    try {
      const client = await create('/ip4/127.0.0.1/tcp/5001');

      const creator = account || await getAccountAddress();

      const metadataJson = {
        title: metadata.title,
        genre: metadata.genre,
        instruments: metadata.instruments.split(",").map(i => i.trim()),
        bpm: parseInt(metadata.bpm) || 0,
        author: creator,
        audio: `ipfs://${uploadedCid}`,
        createdAt: Date.now()
      };

      const buffer = Buffer.from(JSON.stringify(metadataJson));
      const result = await client.add(buffer);
      const cid = result.cid.toString();

      console.log("DEBUG — Metadata CID generado:", cid);

      setMetadataCid(cid);
      alert("Metadata subida correctamente");

    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  function openListModal(nft) {
    setNftToList(nft);
    setShowListModal(true);
  }

  function openBuyModal(item) {
    setItemToBuy(item);
    setShowBuyModal(true);
  }

  async function mintNFT() {
    if (!metadataCid) {
      alert("Primero sube la metadata para generar el tokenURI");
      return;
    }
    if (!account) {
      alert("Conecta la wallet antes de mintear");
      return;
    }

    try {
      // Comprueba que la ABI esté presente
      if (!abis || !abis.ArtNFT) {
        throw new Error("ABI de ArtNFT no encontrada (revisa src/contracts.js).");
      }

      const signer = getSigner();
      const artNFT = getArtNFTContract(signer);

      const tokenURI = `ipfs://${metadataCid}`;
      const royaltyBps = 500; // Regalías del 5% (500 basis points)

      console.log("Minting NFT with tokenURI:", tokenURI);

      // Llamar a la función mint con los 4 argumentos requeridos
      let tx = await artNFT.mint(account, tokenURI, account, royaltyBps);
      let receipt = await tx.wait();

      // Extraer tokenId del evento Minted
      let tokenId = null;
      if (receipt && receipt.events) {
        const evt = receipt.events.find(e => e.event === "Minted");
        if (evt && evt.args) {
          tokenId = evt.args[1].toString(); // El segundo argumento del evento es el tokenId
        }
      }

      if (!tokenId) {
        console.warn("No se pudo extraer tokenId desde eventos. Receipt:", receipt);
        alert("Mint completado pero no se pudo obtener el tokenId del evento. Revisa la consola.");
        return;
      }

      console.log("NFT minteado con tokenId:", tokenId);
      alert(`NFT minteado con éxito. Token ID: ${tokenId}`);

    } catch (err) {
      console.error("Error en mintNFT:", err);
      const msg = err?.reason || err?.data?.message || err?.error?.message || err?.message || String(err);
      alert("Error durante el mint del NFT: " + msg);
    }
  }


  // ----------------------------
  // Helper: intento robusto para leer metadata desde IPFS
  // ----------------------------
  async function fetchIpfsJson(tokenUri) {
    if (!tokenUri) return null;

    // limpiar y normalizar tokenUri
    let uri = (tokenUri || "").trim();

    // si viene con ipfs://, dejar solo el CID
    if (uri.startsWith("ipfs://")) {
      uri = uri.slice(7);
    }

    // Podría venir algo como ipfs://ipfs/<cid> o con prefijo /ipfs/
    if (uri.startsWith("/ipfs/")) {
      uri = uri.slice(6);
    }

    // ahora `uri` debería ser solo el CID (ej: Qm...)
    const localGateway = `http://127.0.0.1:8080/ipfs/${uri}`;
    const publicGateway = `https://ipfs.io/ipfs/${uri}`;

    // Intentar local gateway primero (más rápido si estás en la misma máquina)
    try {
      const resp = await fetch(localGateway, { cache: "no-store" });
      if (resp.ok) {
        const json = await resp.json();
        return json;
      } else {
        console.warn("Local gateway responded", resp.status, resp.statusText);
      }
    } catch (err) {
      console.debug("Local gateway fetch failed:", err.message || err);
    }

    // Si local falla, intentar gateway público
    try {
      const resp2 = await fetch(publicGateway, { cache: "no-store" });
      if (resp2.ok) {
        const json2 = await resp2.json();
        return json2;
      } else {
        console.warn("Public gateway responded", resp2.status, resp2.statusText);
      }
    } catch (err) {
      console.debug("Public gateway fetch failed:", err.message || err);
    }

    // si todo falla, devolver null
    return null;
  }

  // ============================================================
  // FUNCIONALIDAD 4 — Cargar NFTs del usuario
  // ============================================================
  const loadUserNFTs = async () => {
    if (!account) {
      alert("Conecta la wallet primero");
      return;
    }

    try {
      const provider = getProvider();
      const artNFT = getArtNFTContract(provider);

      // buscamos eventos Minted donde account fue el 'to'
      const filter = artNFT.filters.Minted(account, null);
      const events = await artNFT.queryFilter(filter, 0, "latest");

      let nfts = [];

      for (let evt of events) {
        const tokenId = evt.args[1].toString();
        const tokenURI = await artNFT.tokenURI(tokenId);

        // intentar leer metadata (local -> public)
        const metadataJSON = await fetchIpfsJson(tokenURI);

        if (!metadataJSON) {
          console.warn("No se pudo leer metadata para token", tokenId, "tokenURI:", tokenURI);
        }

        nfts.push({
          tokenId,
          tokenURI,
          metadata: metadataJSON
        });
      }

      console.log("Mis NFTs:", nfts);
      setUserNFTs(nfts);

    } catch (err) {
      console.error("Error cargando NFTs:", err);
      alert("Error cargando NFTs. Mira consola para detalles.");
    }
  };


  // ============================================================
  // FUNCIONALIDAD 4 — Cargar NFTs listados en Marketplace
  // ============================================================
  const loadMarketplaceItems = async () => {
    try {
      const provider = getProvider();
      const marketplace = getMarketplaceContract(provider);
      const artNFT = getArtNFTContract(provider);

      let items = [];

      // buscar eventos Listed
      const events = await marketplace.queryFilter("Listed", 0, "latest");

      for (let evt of events) {
        const listingId = evt.args[0].toString();
        const seller = evt.args[1];
        const nftAddress = evt.args[2];
        const tokenId = evt.args[3].toString();
        const price = evt.args[4].toString();

        // comprobar si sigue activo
        const listing = await marketplace.listings(listingId);
        if (!listing.active) continue;

        // tokenURI (asumimos ArtNFT)
        const tokenURI = await artNFT.tokenURI(tokenId);

        // leer metadata de IPFS
        const metadata = await fetchIpfsJson(tokenURI);

        if (!metadata) {
          console.warn("No se pudo cargar metadata para listing", listingId, "tokenURI:", tokenURI);
        }

        items.push({
          listingId: listingId,
          seller: seller,
          tokenId: tokenId.toString(),
          nftAddress: nftAddress,
          priceWei: price.toString(),
          priceEth: ethers.utils.formatEther(price),
          metadata
        });
      }

      console.log("Marketplace items:", items);
      setMarketplaceItems(items);

    } catch (err) {
      console.error("Error cargando marketplace:", err);
      alert("Error cargando marketplace. Mira consola.");
    }
  };

  async function listNFTForSale() {
    try {
      if (!nftToList) return alert("No hay NFT seleccionado.");
      if (!listPrice || Number(listPrice) <= 0) return alert("Precio inválido.");

      const signer = getSigner();
      const marketplace = getMarketplaceContract(signer);

      const priceWei = ethers.utils.parseEther(listPrice);

      console.log("Listando NFT...");
      const tx = await marketplace.listItem(
        ART_NFT_ADDRESS,
        nftToList.tokenId,
        priceWei
      );

      await tx.wait();

      alert("NFT listado correctamente en el marketplace!");

      setShowListModal(false);
      setListPrice("");

      // Actualizar productos del marketplace
      loadMarketplaceItems();
    } catch (err) {
      console.error(err);
      alert("Error al listar NFT: " + err.message);
    }
  }

  async function loadMyListings() {
    try {
      const provider = getProvider();
      const marketplace = getMarketplaceContract(provider);
      const account = await getAccountAddress();

      const listings = [];
      let id = 1;

      while (true) {
        try {
          const l = await marketplace.listings(id);

          // cuando ya no hay más listings, seller = 0x000...
          if (l.seller === "0x0000000000000000000000000000000000000000") {
            break;
          }

          if (l.active && l.seller.toLowerCase() === account.toLowerCase()) {
            listings.push({
              listingId: id,
              seller: l.seller,
              tokenId: l.tokenId.toString(),
              nftAddress: l.nftAddress,
              price: ethers.utils.formatEther(l.price),
            });
          }

          id++;
        } catch (err) {
          // si falla la llamada, asumimos que no hay más listings
          break;
        }
      }

      setMyListings(listings);
    } catch (err) {
      console.error("Error al cargar mis listings:", err);
    }
  }


  async function cancelListing(listingId) {
    try {
      const signer = getSigner();
      const marketplace = getMarketplaceContract(signer);

      console.log("Cancelando listing…");
      const tx = await marketplace.cancel(listingId);
      await tx.wait();

      alert("Listing cancelado correctamente.");

      // recargar marketplace y mis listings
      loadMyListings();
      loadMarketplaceItems();
    } catch (err) {
      console.error("Error cancel listing:", err);
      alert("Error cancelando: " + err.message);
    }
  }

  async function buyNFT() {
    try {
      if (!itemToBuy) return alert("NFT no seleccionado.");

      const signer = getSigner();
      const marketplace = getMarketplaceContract(signer);

      const priceWei = itemToBuy.priceWei;

      console.log("Comprando NFT...");
      const tx = await marketplace.buy(itemToBuy.listingId, { value: priceWei });
      await tx.wait();

      alert("🎉 ¡Compra realizada con éxito!");

      setShowBuyModal(false);

      // Actualizar datos
      loadMarketplaceItems(); // Actualiza los items del marketplace
      await loadUserNFTs();   // Actualiza los NFTs del usuario comprador

    } catch (err) {
      console.error("Error al comprar NFT:", err);
      alert("Error en la compra: " + err.message);
    }
  }

  async function loadActivityFeed() {
    try {
      const provider = getProvider();
      const artNFT = getArtNFTContract(provider);
      const marketplace = getMarketplaceContract(provider);

      const events = [];

      // =====================
      // 1. EVENTOS MINT
      // =====================
      const mintedFilter = artNFT.filters.Minted();
      const mintedLogs = await provider.getLogs({
        ...mintedFilter,
        fromBlock: 0,
        toBlock: "latest",
      });

      for (let log of mintedLogs) {
        const parsed = artNFT.interface.parseLog(log);
        events.push({
          type: "MINT",
          by: parsed.args[0],
          tokenId: parsed.args[1].toString(),
          tokenURI: parsed.args[2],
          block: log.blockNumber,
        });
      }

      // =====================
      // 2. EVENTOS LISTED
      // =====================
      const listedFilter = marketplace.filters.Listed();
      const listedLogs = await provider.getLogs({
        ...listedFilter,
        fromBlock: 0,
        toBlock: "latest",
      });

      for (let log of listedLogs) {
        const parsed = marketplace.interface.parseLog(log);
        events.push({
          type: "LISTED",
          listingId: parsed.args[0].toString(),
          seller: parsed.args[1],
          nft: parsed.args[2],
          tokenId: parsed.args[3].toString(),
          price: ethers.utils.formatEther(parsed.args[4]),
          block: log.blockNumber,
        });
      }

      // =====================
      // 3. EVENTOS BOUGHT
      // =====================
      const boughtFilter = marketplace.filters.Bought();
      const boughtLogs = await provider.getLogs({
        ...boughtFilter,
        fromBlock: 0,
        toBlock: "latest",
      });

      for (let log of boughtLogs) {
        const parsed = marketplace.interface.parseLog(log);
        events.push({
          type: "BOUGHT",
          listingId: parsed.args[0].toString(),
          buyer: parsed.args[1],
          price: ethers.utils.formatEther(parsed.args[2]),
          block: log.blockNumber,
        });
      }

      // =====================
      // 4. EVENTOS CANCELLED
      // =====================
      const cancelFilter = marketplace.filters.Cancelled();
      const cancelLogs = await provider.getLogs({
        ...cancelFilter,
        fromBlock: 0,
        toBlock: "latest",
      });

      for (let log of cancelLogs) {
        const parsed = marketplace.interface.parseLog(log);
        events.push({
          type: "CANCELLED",
          listingId: parsed.args[0].toString(),
          block: log.blockNumber,
        });
      }

      // Ordenar por bloque (cronológico)
      events.sort((a, b) => a.block - b.block);

      setActivityFeed(events);

    } catch (err) {
      console.error("Error cargando actividad:", err);
    }
  }


  return (
    <div className="app-shell">
      <header className="app-header panel">
        <div className="brand">
          <img src={logo} className="brand-logo" alt="logo" />
          <div className="brand-text">
            <h1>Music IPFS Studio</h1>
            <div className="subtitle">Sube y registra tus creaciones musicales</div>
          </div>
        </div>

        <div className="nav">
          {connected ? (
            <>
              <div className="account-pill">{account.slice(0, 6)}...{account.slice(-4)}</div>
              <button className="btn btn-ghost" onClick={disconnectWallet}>Desconectar</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>Conectar Wallet</button>
          )}
        </div>
      </header>

      {/* Barra de navegación */}
      <nav className="nav-bar">
        <button className={`nav-item ${activeTab === "marketplace" ? "active" : ""}`} onClick={() => setActiveTab("marketplace")}>Marketplace</button>
        <button className={`nav-item ${activeTab === "upload" ? "active" : ""}`} onClick={() => setActiveTab("upload")}>Subir Archivo</button>
        <button className={`nav-item ${activeTab === "myNFTs" ? "active" : ""}`} onClick={() => setActiveTab("myNFTs")}>Mis NFTs</button>
        <button className={`nav-item ${activeTab === "myListings" ? "active" : ""}`} onClick={() => setActiveTab("myListings")}>Mis Listings</button>
        <button className={`nav-item ${activeTab === "activity" ? "active" : ""}`} onClick={() => setActiveTab("activity")}>Actividad</button>
      </nav>

      <main className="container">
        {/* Mostrar la sección activa */}
        {activeTab === "marketplace" && (
          <section className="panel">
            <h2>Marketplace</h2>
            <button className="btn btn-primary" onClick={loadMarketplaceItems}>Cargar marketplace</button>
            <div className="nft-grid">
              {marketplaceItems.length === 0 && <p className="muted">No hay NFTs listados.</p>}
              {marketplaceItems.map(item => (
                <div key={item.listingId} className="nft-card">
                  <h3>{item.metadata?.title}</h3>
                  {item.metadata?.image && (
                    <img
                      src={item.metadata.image.replace("ipfs://", "https://ipfs.io/ipfs/")}
                      alt="cover"
                      className="nft-cover"
                    />
                  )}
                  <p><strong>ID:</strong> {item.tokenId}</p>
                  <p><strong>Precio:</strong> {item.priceEth} ETH</p>
                  <p><strong>Vendedor:</strong> {item.seller.slice(0, 6)}...{item.seller.slice(-4)}</p>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: "8px", width: "100%" }}
                    onClick={() => openBuyModal(item)}
                  >
                    Comprar
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ marginTop: "8px", width: "100%" }}
                    onClick={() => playNFT(item)}
                  >
                    ▶️ Reproducir
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "upload" && (
          <section className="panel upload-panel">
            <h2>Subir archivo musical</h2>
            <input type="file" accept="audio/*,image/*,text/*" onChange={selectMusicFile} />
            <button className="btn btn-primary" onClick={uploadMusicFile}>Subir a IPFS</button>
            {filePreview && fileType.startsWith("audio") && (
              <audio controls src={filePreview} style={{ marginTop: 10, width: "100%" }} />
            )}
            {filePreview && fileType.startsWith("image") && (
              <img src={filePreview} alt="preview" style={{ width: "100%", marginTop: 10 }} />
            )}
            {uploadedCid && (
              <>
                <p><strong>CID del archivo:</strong> {uploadedCid}</p>
                <p><a href={`http://127.0.0.1:8080/ipfs/${uploadedCid}`} target="_blank">Abrir en nodo local</a></p>
              </>
            )}

            <h3 style={{ marginTop: "24px" }}>Metadatos</h3>
            <div className="metadata-form">
              <label>
                Título:
                <input
                  type="text"
                  name="title"
                  value={metadata.title}
                  onChange={handleMetadataChange}
                  placeholder="Título de la canción"
                />
              </label>
              <label>
                Género:
                <input
                  type="text"
                  name="genre"
                  value={metadata.genre}
                  onChange={handleMetadataChange}
                  placeholder="Género musical"
                />
              </label>
              <label>
                Instrumentos:
                <input
                  type="text"
                  name="instruments"
                  value={metadata.instruments}
                  onChange={handleMetadataChange}
                  placeholder="Instrumentos separados por comas"
                />
              </label>
              <label>
                BPM:
                <input
                  type="number"
                  name="bpm"
                  value={metadata.bpm}
                  onChange={handleMetadataChange}
                  placeholder="Beats por minuto"
                />
              </label>
              <button className="btn btn-primary" onClick={uploadMetadata} style={{ marginTop: "16px" }}>
                Subir Metadatos a IPFS
              </button>
            </div>
            {metadataCid && (
              <>
                <p><strong>CID de los metadatos:</strong> {metadataCid}</p>
                <p><a href={`http://127.0.0.1:8080/ipfs/${metadataCid}`} target="_blank">Abrir en nodo local</a></p>
                <button className="btn btn-primary" onClick={mintNFT} style={{ marginTop: "16px" }}>
                  Mintear NFT
                </button>
              </>
            )}
          </section>
        )}

        {activeTab === "myNFTs" && (
          <section className="panel">
            <h2>Mis NFTs</h2>
            <button className="btn btn-primary" onClick={loadUserNFTs}>Cargar mis NFTs</button>
            <div className="nft-grid">
              {userNFTs.length === 0 && <p className="muted">No tienes NFTs todavía.</p>}
              {userNFTs.map(nft => (
                <div key={nft.tokenId} className="nft-card">
                  <h3>{nft.metadata?.title || "Sin título"}</h3>
                  {nft.metadata?.image && (
                    <img
                      src={nft.metadata.image.replace("ipfs://", "https://ipfs.io/ipfs/")}
                      alt="cover"
                      className="nft-cover"
                    />
                  )}
                  <p><strong>ID:</strong> {nft.tokenId}</p>
                  <p><strong>Género:</strong> {nft.metadata?.genre}</p>
                  <p><strong>BPM:</strong> {nft.metadata?.bpm}</p>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: "8px", width: "100%" }}
                    onClick={() => openListModal(nft)}
                  >
                    Listar en Marketplace
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ marginTop: "8px", width: "100%" }}
                    onClick={() => playNFT(nft)}
                  >
                    ▶️ Reproducir
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "myListings" && (
          <section className="panel">
            <h2>Mis Listings en el Marketplace</h2>
            <button className="btn btn-primary" onClick={loadMyListings}>Cargar mis listings</button>
            {myListings.length === 0 && <p className="muted">No tienes listings activos.</p>}
            <div className="grid" style={{ marginTop: 16 }}>
              {myListings.map(item => (
                <div key={item.listingId} className="card">
                  <h3>NFT #{item.tokenId}</h3>
                  <p>Precio: <strong>{item.price} ETH</strong></p>
                  <button
                    className="btn btn-outline"
                    style={{ marginTop: 8 }}
                    onClick={() => cancelListing(item.listingId)}
                  >
                    Cancelar Listing
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {activeTab === "activity" && (
        <section className="panel">
          <h2>Historial de Actividad</h2>

          <button className="btn btn-primary" onClick={loadActivityFeed}>
            Cargar historial
          </button>

          <ul style={{ marginTop: 16 }}>
            {activityFeed.length === 0 && (
              <p className="muted">No hay actividad registrada.</p>
            )}

            {activityFeed.map((e, index) => (
              <li key={index} style={{ marginBottom: 10 }}>
                {e.type === "MINT" && (
                  <>
                    🟢 <strong>Mint</strong> — NFT #{e.tokenId} creado por {e.by.slice(0, 6)}...
                  </>
                )}

                {e.type === "LISTED" && (
                  <>
                    🔵 <strong>Listado</strong> — NFT #{e.tokenId} listado por {e.seller.slice(0, 6)}... por {e.price} ETH
                  </>
                )}

                {e.type === "BOUGHT" && (
                  <>
                    🟣 <strong>Compra</strong> — Listing #{e.listingId} comprado por {e.buyer.slice(0, 6)}... por {e.price} ETH
                  </>
                )}

                {e.type === "CANCELLED" && (
                  <>
                    🟠 <strong>Cancelado</strong> — Listing #{e.listingId} cancelado
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modales */}
      {showListModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Listar NFT #{nftToList?.tokenId}</h3>
            <input
              type="number"
              placeholder="Precio en ETH"
              value={listPrice}
              onChange={e => setListPrice(e.target.value)}
              style={{ width: "100%", marginTop: 10 }}
            />
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
              <button className="btn btn-primary" onClick={listNFTForSale}>Confirmar</button>
              <button className="btn btn-outline" onClick={() => setShowListModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showBuyModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Comprar NFT #{itemToBuy?.tokenId}</h3>
            <p>Precio: <strong>{itemToBuy?.priceEth} ETH</strong></p>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
              <button className="btn btn-primary" onClick={buyNFT}>Confirmar compra</button>
              <button className="btn btn-outline" onClick={() => setShowBuyModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {audioUrl && nowPlaying && (
        <div className="music-player">
          <img src={nowPlaying.image} alt="cover" className="player-cover" />
          <div className="player-info">
            <h4>{nowPlaying.title}</h4>
            <p>{nowPlaying.genre} — {nowPlaying.bpm} BPM</p>
          </div>
          <audio controls autoPlay src={audioUrl} className="player-audio" />
        </div>
      )}
      <footer className="app-footer">© 2025 Music IPFS Studio</footer>
    </div>
  );
}

export default App;
