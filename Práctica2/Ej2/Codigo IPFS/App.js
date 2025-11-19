import React, { useEffect, useState } from "react";
import './App.css';
import { create } from 'kubo-rpc-client';
import { ethers } from "ethers";
import { Buffer } from "buffer";
import logo from "./logo.svg";
import { addresses, abis } from "./contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ART_NFT_ADDRESS = "0x11bA54FCf48Db5bD7843650bD4F03Cf48eBf2aA1";       // dirección del contrato ArtNFT
const MARKETPLACE_ADDRESS = "0x9d00Fe8DF3A990D5Ef6BE8DbD964ffbdbD189EE8";   // dirección del Marketplace

let client;

// helpers: provider / signer / contratos bajo demanda
function getProvider() {
  return new ethers.providers.Web3Provider(window.ethereum);
}
function getSigner() {
  return getProvider().getSigner();
}
function getContract(address, abi, signerOrProvider) {
  return new ethers.Contract(address, abi, signerOrProvider);
}
function getIpfsContract(signerOrProvider) {
  return getContract(addresses.ipfs, abis.ipfs, signerOrProvider || getProvider());
}
function getArtNFTContract(signerOrProvider) {
  return getContract(ART_NFT_ADDRESS, abis.ArtNFT_abi, signerOrProvider || getSigner());
}
function getMarketplaceContract(signerOrProvider) {
  return getContract(MARKETPLACE_ADDRESS, abis.Marketplace_abi, signerOrProvider || getSigner());
}

// helper para pedir cuenta explícitamente (evita ENS)
async function getAccountAddress() {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts && accounts.length ? accounts[0] : null;
}

// lee user file en contrato IPFS (usa eth_requestAccounts internamente)
async function readCurrentUserFile() {
  const address = await getAccountAddress();
  if (!address) return ZERO_ADDRESS;
  const ipfsC = getIpfsContract(getProvider());
  const result = await ipfsC.userFiles(address);
  console.log({ result });
  return result;
}

function App() {
  const [account, setAccount] = useState(null);
  const [connected, setConnected] = useState(false);
  const [ipfsHash, setIpfsHash] = useState("");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0.01");

  // conectar wallet - guarda cuenta y carga ipfsHash si existe
  async function connectWallet() {
    if (!window.ethereum) {
      alert("Instala MetaMask u otro proveedor web3");
      return;
    }
    try {
      const a = await getAccountAddress();
      setAccount(a);
      setConnected(!!a);
      if (a) {
        const userFile = await readCurrentUserFile();
        if (userFile && userFile !== ZERO_ADDRESS) setIpfsHash(userFile);
      }
    } catch (err) {
      console.error("Error conectando wallet:", err);
    }
  }

  function disconnectWallet() {
    setAccount(null);
    setConnected(false);
  }

  useEffect(() => {
    // no solicitar cuentas automáticamente por defecto; solo leer si ya conectada
    // si quieres auto-conexión, llama connectWallet() aquí
  }, []);

  async function setFileIPFS(hash) {
    // crear contrato con signer en el momento de la tx
    const ipfsWithSigner = getIpfsContract(getSigner());
    console.log("TX contract setFileIPFS");
    const tx = await ipfsWithSigner.setFileIPFS(hash);
    await tx.wait();
    console.log({ tx });
    setIpfsHash(hash);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!file) throw new Error("Selecciona un archivo primero");
      // conectar a la instancia local de ipfs (HTTP)
      const clientLocal = await create({ url: 'http://127.0.0.1:5001' });
      const result = await clientLocal.add(file);
      // copiar al MFS para ver en dashboard (opcional)
      try {
        await clientLocal.files.cp(`/ipfs/${result.cid}`, `/${result.cid}`);
      } catch (err) {
        // ignore if CP fails
        console.debug("cp to MFS failed (non-fatal):", err.message || err);
      }
      console.log("CID local:", result.cid.toString());
      await setFileIPFS(result.cid.toString());
    } catch (error) {
      console.error(error);
      alert(error.message || error);
    }
  };

  const retrieveFile = (e) => {
    const data = e.target.files[0];
    const reader = new window.FileReader();
    reader.readAsArrayBuffer(data);
    reader.onloadend = () => {
      setFile(Buffer(reader.result));
    };
    e.preventDefault();
  };

  const handleArtworkUpload = async (e) => {
    e.preventDefault();
    try {
      if (!file) throw new Error("Selecciona un archivo antes de subir.");
      const creator = await getAccountAddress();
      if (!creator) throw new Error("Conecta la wallet antes de subir.");

      // 1. Conectar IPFS local (RPC)
      client = await create('/ip4/127.0.0.1/tcp/5001');

      // 2. Subir archivo de arte a IPFS
      console.log("Subiendo archivo a IPFS...");
      const artFile = await client.add(file);
      const artCID = artFile.cid.toString();
      console.log("CID del archivo:", artCID);

      // 3. Construir metadata JSON para el NFT
      const metadata = {
        name: title || "Obra sin título",
        description: description || "Descripción no especificada",
        image: `ipfs://${artCID}`,
        creator: creator,
        attributes: [
          { trait_type: "Año", value: "2025" },
          { trait_type: "Formato", value: "Digital Art" }
        ],
        priceWei: ethers.utils.parseEther(price || "0.01").toString()
      };

      // 4. Subir metadata a IPFS
      const metadataBuffer = Buffer.from(JSON.stringify(metadata));
      const metaFile = await client.add(metadataBuffer);
      const metaCID = metaFile.cid.toString();
      const tokenURI = `ipfs://${metaCID}`;

      // 5. Mint del NFT (crear contrato con signer)
      const signer = getSigner();
      const artNFT = getArtNFTContract(signer);
      console.log("Ejecutando mint...");
      let tx = await artNFT.mint(creator, tokenURI);
      let receipt = await tx.wait();
      console.log("Mint completado:", receipt);

      // Extraer tokenId del evento Minted (fallback if event shape differs)
      let tokenId = null;
      if (receipt.events) {
        const mintEvent = receipt.events.find(ev => ev.event === "Minted");
        if (mintEvent && mintEvent.args) {
          tokenId = mintEvent.args[1]?.toNumber ? mintEvent.args[1].toNumber() : mintEvent.args[1];
        }
      }
      if (tokenId === null) {
        // intentar sacar tokenId de logs o de receipt (depende del contrato)
        console.warn("No se pudo extraer tokenId del evento Minted, revisa receipt", receipt);
      } else {
        // 6. Approve marketplace
        console.log("Aprobando Marketplace...");
        tx = await artNFT.approve(MARKETPLACE_ADDRESS, tokenId);
        await tx.wait();

        // 7. Listar NFT en Marketplace
        console.log("Listando NFT en el Marketplace...");
        const marketplace = getMarketplaceContract(signer);
        tx = await marketplace.listItem(
          ART_NFT_ADDRESS,
          tokenId,
          metadata.priceWei
        );
        await tx.wait();
      }

      alert("¡Obra subida, minteada y (si procede) listada correctamente!");
    } catch (error) {
      console.error("Error al subir arte:", error);
      alert("Error: " + (error.message || error));
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={logo} alt="logo" className="brand-logo" />
          <div className="brand-text">
            <h1>ArtIPFS Marketplace</h1>
            <p className="subtitle">Sube, mintea y vende tus obras en IPFS + Ethereum</p>
          </div>
        </div>

        <nav className="nav">
          <button className="btn btn-ghost" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Inicio</button>
          <button className="btn btn-ghost" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>Subir obra</button>

          <button
            className={connected ? "btn btn-outline" : "btn btn-primary"}
            onClick={connected ? disconnectWallet : connectWallet}
          >
            {connected && account ? `${account.slice(0,6)}...${account.slice(-4)}` : "Conectar Wallet"}
          </button>
        </nav>
      </header>

      <main className="container">
        <section className="panel upload-panel">
          <h2>Subir obra de arte</h2>
          <p className="helper">Rellena los datos, selecciona el fichero y haz click en "Subir obra". Se subirá a IPFS, se minteará y se listará en el Marketplace.</p>

          <form className="form" onSubmit={handleArtworkUpload}>
            <label className="label">
              <span>Título</span>
              <input
                className="input"
                type="text"
                placeholder="Título de la obra"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label className="label">
              <span>Descripción</span>
              <textarea
                className="textarea"
                placeholder="Descripción de la obra"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <div className="form-grid">
              <label className="label">
                <span>Precio (ETH)</span>
                <input
                  className="input"
                  type="text"
                  placeholder="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              <label className="label file-label">
                <span>Archivo</span>
                <input
                  className="file-input"
                  type="file"
                  onChange={retrieveFile}
                />
              </label>
            </div>

            <div className="actions">
              <button type="submit" className="btn btn-primary">Subir obra</button>
              <button type="button" className="btn btn-outline" onClick={() => { setTitle(''); setDescription(''); setPrice('0.01'); setFile(null); }}>Limpiar</button>
            </div>
          </form>

          <form className="form" onSubmit={handleSubmit} style={{ marginTop: 12 }}>
            {/* form secundario para solo subir al IPFS local y guardar CID en contrato */}
            <div className="actions">
              <button type="submit" className="btn btn-primary">Subir archivo a IPFS (solo CID)</button>
            </div>
          </form>
        </section>

        <aside className="panel preview-panel">
          <h3>Previsualización</h3>

          <div className="preview-card">
            {file ? (
              <div className="preview-media">
                <img
                  alt="preview"
                  src={file instanceof Buffer ? URL.createObjectURL(new Blob([file])) : undefined}
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
            ) : (
              <div className="preview-empty">Selecciona un archivo para previsualizar</div>
            )}

            <div className="meta">
              <div className="meta-row"><strong>Título:</strong> {title || '—'}</div>
              <div className="meta-row"><strong>Descripción:</strong> {description || '—'}</div>
              <div className="meta-row"><strong>Precio:</strong> {price} ETH</div>
              <div className="meta-row"><strong>Dirección creador:</strong> {account ? account : 'Conecta tu wallet'}</div>
              <div className="meta-row"><strong>IPFS CID guardado:</strong> {ipfsHash || '—'}</div>
            </div>
          </div>

          <div className="note">
            <small>Tras subir se generará el token y se listará automáticamente en el Marketplace configurado.</small>
          </div>
        </aside>
      </main>

      <footer className="app-footer">
        <div>© {new Date().getFullYear()} ArtIPFS · Hecho con IPFS & Ethereum</div>
      </footer>
    </div>
  );
}

export default App;