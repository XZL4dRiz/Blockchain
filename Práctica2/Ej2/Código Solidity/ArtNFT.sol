// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/access/Ownable.sol";

contract ArtNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    address public marketplace;

    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event MarketplaceSet(address indexed previous, address indexed current);

    constructor(string memory name_, string memory symbol_) 
        ERC721(name_, symbol_) 
        Ownable(msg.sender) 
    {
        _nextTokenId = 1;
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        address previous = marketplace;
        marketplace = _marketplace;
        emit MarketplaceSet(previous, _marketplace);
    }

    function mint(address recipient, string memory tokenURI) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId += 1;

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);

        emit Minted(recipient, tokenId, tokenURI);
        return tokenId;
    }

    function isApprovedForAll(address owner_, address operator) 
        public 
        view 
        override(ERC721, IERC721) 
        returns (bool) 
    {
        if (operator == marketplace) {
            return true;
        }
        return super.isApprovedForAll(owner_, operator);
    }
}
